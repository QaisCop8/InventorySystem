import { NextRequest, NextResponse } from "next/server";
import odbc, { Connection } from "odbc";
import { Pool } from "pg"
/* ======================================================
   CONFIG
====================================================== */

const dsn = process.env.PERVASIVE_DSN ?? "Data64";

const ODBC_CONNECTION_STRING = `DSN=${dsn};UID=Shamel;PWD=IS011197;`;


/* ======================================================
   TYPES
====================================================== */

export interface OrderItem {
  id: number;                  // matches 'id'
  order_id: number;            // matches 'order_id'
  product_id: number;          // matches 'product_id'
  product_code: string;        // matches 'product_code'
  product_name: string;        // matches 'product_name'
  quantity: number;            // matches 'quantity'
  price: number;               // matches 'price'
  discount: number;            // matches 'discount'
  barcode?: string;            // matches 'barcode', optional
  unit_id?: number;            // matches 'unit_id', optional
  store_id?: number;           // matches 'store_id', optional
  delivered_quantity: number;  // matches 'delivered_quantity'
  expiry_date?: string;        // matches 'expiry_date', optional, could also be Date
  batch_number?: string;       // matches 'batch_number', optional
  item_status?: number;        // matches 'item_status', optional
  created_at?: string;         // matches 'created_at', optional
  updated_at?: string;         // matches 'updated_at', optional
  bonus?: number;              // matches 'bonus', optional
}

interface OrderPayload {
  id: number
  order_number: string;
  order_date: string;
  customer_code: string;
  customer_name: string;
  currency: string;
  exchange_rate: number;
  total_amount: number;
  vat_amount: number;
  discount_amount: number;
  discount_type: number;
  items: OrderItem[];
  reference_number: string;
  general_notes: string;
  order_type_id: number;
  is_exported: number;
  customer_order_no: string;
  received_by: string;
}

/* ======================================================
   LOGGING
====================================================== */

function log(message: string, meta?: unknown) {
  console.log(`[PERVASIVE MIGRATION] ${message}`, meta ?? "");
}

/* ======================================================
   HELPERS
====================================================== */


const Inc_Code = (code: string, prefix: string): string => {
  let codeValue = code.replace(prefix, '');
  let code2 = codeValue.split('');
  let i = code2.length - 1;

  while (i > 0 && code2[i] === ' ') {
    i--;
  }

  if (code2[i] === '9') {
    while (code2[i] === '9' && i > 0) {
      code2[i] = '0';
      i--;
    }
    if (code2[i] === '9') {
      code2[i] = 'A';
    } else {
      code2[i] = String.fromCharCode(code2[i].charCodeAt(0) + 1);
    }
  } else {
    if (code2[i] === '9') {
      code2[i] = 'A';
    } else {
      code2[i] = String.fromCharCode(code2[i].charCodeAt(0) + 1);
    }
  }

  // Join the array back to a string
  let newCode = code2.join('');
  newCode = prefix + newCode;
  return newCode;
}
async function getNextVoucherID(
  connection: odbc.Connection,
  orderNumber: string,
  orderTypeId: number
): Promise<string> {
  // I + book (second char of order number)
  const vchBook = orderNumber.substring(1, 2);
  let prefix = `I${vchBook}`;
  if (orderTypeId === 2) {
    prefix = `H${vchBook}`;
  }
  const likePattern = `${prefix}%`;

  const result = await connection.query<{
    MaxNum: string | null;
  }>(
    `
    SELECT MAX(VoucherID) AS MaxNum
    FROM cpage
    WHERE VoucherID LIKE ?
    `,
    [likePattern]
  );

  const lastVoucher = result[0]?.MaxNum;

  // First voucher in this book
  if (!lastVoucher) {
    return `${prefix}000001`;
  }

  // Increment existing voucher
  return Inc_Code(lastVoucher, prefix);
}
async function getVatAccount(
  connection: Connection,
  orderTypeId: number
): Promise<string> {
  const pos = orderTypeId === 1 ? 482 : 483;

  const result = await connection.query<{ Names: string }>(`
    SELECT Names
    FROM multifl
    WHERE typefile = 48 AND pos = ?
  `, [pos]);

  if (!result.length) {
    throw new Error("VAT account not found");
  }

  return result[0].Names;
}


async function getItemAccount_sales(
  connection: Connection,
  stockId: string
): Promise<string | null> {  // allow null if not found
  const result = await connection.query<{ Cr_Code: string }>(
    `SELECT Cr_Code FROM stock WHERE StockID = ?`,
    [stockId]
  );

  if (!result.length) return null; // return null if not found
  return result[0].Cr_Code;
}

async function getItemAccount_purchase(
  connection: Connection,
  stockId: string
): Promise<string | null> {  // allow null if not found
  const result = await connection.query<{ Dr_Code: string }>(`
    SELECT Dr_Code
    FROM stock
    WHERE StockID = ?
  `, [stockId]);

  if (!result.length) return null;

  return result[0].Dr_Code;
}

/* ======================================================
   API
====================================================== */
function formatDate(date: Date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function formatTime(date: Date) {
  return date.toTimeString().split(' ')[0]; // HH:MM:SS
}

export async function insertCPage(
  connection: odbc.Connection,
  voucherId: string,
  order: OrderPayload,
  insertOrder: number,
  userId: number,
  total_amount: number,
) {
  const now = new Date();
  const orderDateStr = formatDate(new Date(order.order_date));
  const insertDateStr = formatDate(now);
  const insertTimeStr = formatTime(now);
  const manualDateStr = formatDate(new Date(order.order_date));
  const manualVch = order.reference_number ?? "";
  const note = (
    (order.received_by ?? "") + " " +
    (order.customer_order_no ?? "") + " " +
    (order.general_notes ?? "")

  ).slice(0, 80);

  const sql = `
INSERT INTO cpage (
  VoucherID, Date, Name, CS_code, Othervch, ManualVchOld,
  Curr, Rate, Balance, SMan, NoteOld, Printed, "User", Intern,
  City, Mode, CostCent, PrintSetup, Signature, InsertOrder,
  InsertDate, InsertTime, UpdateDate, UpdateTime, InsertUser,
  S_man_orginal, PaymentType, pivotingPostedStock, pivotingPostedAcc,
  PaymentType1, Approved, tempInt1, tempInt2, tempInt3, Phone,
  isCheqPrinted, Note, VchTypeEn, VchTypeAr, SMDSynced,
  tmpInteger1, tmpInteger2, VAT_reg, Vat_Type, tmpStrr, tmpDbl,
  Manual_Date, ManualVch
) VALUES (
  '${voucherId}', '${orderDateStr}', '${order.customer_name}', '${order.customer_code}', '${order.order_number}', '',
  '${order.currency}', ${order.exchange_rate}, ${total_amount}, '', '', 0, ${userId}, 0,
  0, 0, 0, 0, '', ${insertOrder},
  '${insertDateStr}', '${insertTimeStr}', '${insertDateStr}', '${insertTimeStr}', ${userId},
  '', 0, 0, 0,
  0, 1, 0, 0, 0, '',
  0, '${note}', 'Invoice', 'فاتورة', 0,
  0, 0, '', 0, '',0, '${manualDateStr}', '${manualVch}'
)
`;


  await connection.query(sql);

}



export async function insertStrans(
  connection: odbc.Connection,
  voucherId: string,
  order: OrderPayload,
  item: OrderItem,
  insertOrder: number,
  userId: number,
  pos: number
): Promise<number> {
  const now = new Date();

  // Format dates
  const orderDateStr = formatDate(new Date(order.order_date));
  const prodDateStr = '1990-01-01'
  const expiryDateStr = item.expiry_date ? formatDate(new Date(item.expiry_date)) : formatDate(now);
  const vat_amount = order.vat_amount ?? 0;
  const discount = order.discount_amount ?? 0;
  let Balance = Number(order.total_amount) - Number(vat_amount) + Number(discount);
  if (order.customer_code != "") {
    const cust_price = await getcustPriceIfExists(connection, order.customer_code, item.product_code);
    if (cust_price > 0) {
      item.price = cust_price
    }
  }
  let vat = 0;
  if (order.vat_amount && Balance > 0) {
    vat = (item.quantity * item.price - (item.discount || 0)) * (order.vat_amount / Balance);
  }
  const priceValue = Number(item.price) || 0;
  const balanceValue = Number(Balance) || 0;
  const discountValue = Number(discount) || 0;

  const price =
    priceValue *
    (1 - (balanceValue > 0 ? discountValue / balanceValue : 0));
  const lineTotal =
    item.quantity * price - (item.discount ?? 0) + vat;

  // Prepare note
  const note = item.product_name.replace(/'/g, "''"); // Escape single quotes
  const store_id = (item.store_id != null ? item.store_id - 1 : 0);
  const unit_id = (item.unit_id != null ? item.unit_id - 1 : 0);
  const sql = `
INSERT INTO strans (
  "Voucher ID", "Pos", "Date", "SCode", "UnitNum", "Stat", "Store", "Measure", "Color",
  "Qnty", "Price", "SoldQnty", "Note", "Del Code", "Cost Price", "Bonus", "Discount",
  "Vat", "S.Man Per", "LengthOld", "WidthOld", "HightOld", "NumOld", "Sort",
  "Prod. date", "Expiry date", "SecondQnty", "SecondPrice", "Spatch", "ProdType",
  "CostRatio", "InsertOrder", "standardPrice", "Length", "Width", "Hight",
  "stkVAT_classificatio", "stkVAT_rate", "Units1", "Units2", "Units3", "Units4",
  "Units5", "Units6", "Unit_rels1", "Unit_rels2", "Unit_rels3", "Unit_rels4",
  "Unit_rels5", "Unit_rels6", "Costcenter1", "Costcenter2", "Costcenter3",
  "Costcenter4", "Costcenter5", "Costcenter6", "Num", "S_name", "TempChar", "ItemNote"
) VALUES (
  '${voucherId}', ${pos}, '${orderDateStr}', '${item.product_code}', ${unit_id}, 0,
  ${store_id}, ${-1}, ${-1},
  ${item.quantity}, ${price}, ${item.quantity}, '${note}', '', ${0},
  ${item.bonus ?? 0}, ${item.discount ?? 0}, ${vat}, ${0},
  ${0}, ${0}, ${0}, ${0}, ${0},
  '${prodDateStr}', '${expiryDateStr}', ${0}, ${0}, '${item.batch_number ?? ""}', ${0},
  ${0}, ${insertOrder}, ${item.price}, ${0}, ${0}, ${0},
  ${0}, ${0}, '${""}', '${""}', '${""}', '${""}',
  '${""}', '${""}', ${0}, ${0}, ${0}, ${0},
  ${0}, ${0}, '${""}', '${""}', '${""}',
  '${""}', '${""}', '${""}', ${item.quantity}, '${item.barcode ?? ""}', '${""}', '${""}'
)
`;

  await connection.query(sql);
  return lineTotal;
}

export async function updateSitems(
  connection: odbc.Connection,
  order: OrderPayload,
  item: OrderItem,
  orderTypeId: number
) {
  let qty = (item.quantity || 0) + (item.bonus || 0);
  if(orderTypeId === 1) {
    qty = -qty; 
  }
  // 1. Try UPDATE
  const updateResult: any = await connection.query(
    `
    UPDATE sitems
    SET Qnty = Qnty + 
      CASE 
        WHEN ? = 1 THEN ?
        ELSE -?
      END
    WHERE Code = ? AND Store = ?
    `,
    [order.order_type_id, qty, qty, item.product_code, item.store_id != null ? item.store_id - 1 : 0]
  );

  const affected =
    updateResult?.count ??
    updateResult?.affectedRows ??
    updateResult?.rowsAffected ??
    0;

  // 2. If not exists → INSERT
  if (affected === 0) {
    await connection.query(
      `
      INSERT INTO sitems (
        Code, Store, Measure, Color, Pos,
        "Any trans", "St Qnty", Qnty,
        "Min Qnty", "Max Qnty", "Count Qnty",
        "Not used 1", ColRow, PostToShamel
      )
      VALUES (?, ?, -1, -1, -1, 0, 0, ?, 0, 0, 0, 0, '', 0)
      `,
      [
        item.product_code ?? '',
        item.store_id != null ? item.store_id - 1 : 0,
        qty
      ]
    );
  }
}
export async function insertCtrans(
  connection: odbc.Connection,
  voucherId: string,
  order: OrderPayload,
  amount: number,
  insertOrder: number,
  pos: number,
  cr_dr: number,
  code: string
) {
  const now = new Date();
  const insertDateStr = formatDate(now);
  const insertTimeStr = formatTime(now);

  const currency = order.currency ?? "ILS"; // default currency
  const exchangeRate = order.exchange_rate ?? 1;

  const sql = `
INSERT INTO ctrans (
  "Vch. ID", Pos, Date, Code,
  Curr, Amount, CrDr, "Cost cent.", Sort,
  "back 1", "back 2", "CostCent21", "CostCent22", "CostCent23", "CostCent24", "CostCent25",
  InsertOrder, TransCurr, TransRate, tmpChar, balanceCode, balancePos
) VALUES (
  '${voucherId}', ${pos}, '${formatDate(new Date(order.order_date))}', '${code}',
  '${currency}', ${amount}, ${cr_dr}, '', 0,
  0, 0, '', '', '', '', '',
  ${insertOrder}, '${currency}', ${exchangeRate}, '', '', 0
)
`;

  await connection.query(sql);
}


export async function insertSPage(
  connection: odbc.Connection,
  voucherId: string,
  order: OrderPayload,
  insertOrder: number,
  total_amount: number
) {
  const now = new Date();

  const orderDateStr = formatDate(new Date(order.order_date));
  const suppInvDateStr = orderDateStr; // you can adjust if needed
  const vatDueDateStr = orderDateStr;  // adjust if needed
  const vchTimeStr = formatTime(now);

  const currency = order.currency ?? "ILS";
  const rate = order.exchange_rate ?? 1;
  const vat = order.vat_amount ?? 0;
  const discount = order.discount_amount ?? 0;
  let Balance = Number(total_amount) - Number(vat) + Number(discount);
  const sql = `
INSERT INTO spage (
  "Voucher ID", "Date", "SuppInvDate", "Vat due date", "Vch time", "Curr",
  "Pr. Vch.", "U_code", "Pele_shipaddr", "Stat", "Vat type", "Vat_to_store",
  "Rate", "Balance", "Vat", "Discount",
  "ColVisible 1", "ColVisible 2", "ColVisible 3", "ColVisible 4",
  "ColVisible 5", "ColVisible 6", "InserOrder", "GroupingPrint", "TempCode",
  "ImportedExported", "VatClassification", "shippingCar", "shippingDriver"
) VALUES (
  '${voucherId}', '${orderDateStr}', '${suppInvDateStr}', '${vatDueDateStr}', '${vchTimeStr}', '${currency}',
  '', 0, 0, 0, 0, 0,
  ${rate}, ${Balance}, ${vat}, ${discount},
  0, 0, 0, 0,
  0, 0, ${insertOrder}, 0, '',
  0, 0, 0, 0
)
`;

  await connection.query(sql);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
export async function getOrderItems(orderId: number): Promise<OrderItem[]> {
  const client = await pool.connect();
  try {
    const result = await client.query<OrderItem>(
      `
      SELECT 
        oi.id,
        oi.order_id,
        oi.product_id,
        p.product_name,
        p.product_code,
        oi.quantity,
        oi.price,
        oi.discount,
        oi.barcode,
        oi.unit_id,
        oi.store_id,
        oi.delivered_quantity,
        oi.expiry_date,
        oi.batch_number,
        oi.item_status,
        oi.created_at,
        oi.updated_at,
        oi.bonus
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
      `,
      [orderId]
    );

    return result.rows;
  } finally {
    client.release();
  }
}
async function checkStockExists(connection: odbc.Connection, productCode: string): Promise<boolean> {
  const result = await connection.query<{ exist: number }>(
    `SELECT COUNT(*) AS exist FROM stock WHERE StockID = ?`,
    [productCode]
  );
  return result.length > 0 && Number(result[0].exist) > 0;
}

async function checkManualExists(
  connection: odbc.Connection,
  manualVoucher: string
): Promise<string | null> {

  const result = await connection.query<{ VoucherID: string }>(
    `SELECT VoucherID 
     FROM cpage 
     WHERE rtrim(ltrim(ManualVch)) = ?`,
    [`${manualVoucher}`]
  );

  if (result.length > 0) {
    return result[0].VoucherID;
  }

  return null;
}


async function getcustPriceIfExists(
  connection: odbc.Connection,
  cs_code: string,
  productCode: string
): Promise<number> {

  const result = await connection.query<{ price: number }>(
    `SELECT sp_price1 AS price 
     FROM custpric
     WHERE cs_code = ? AND st_code = ?`,
    [cs_code, productCode]
  );

  if (result.length > 0 && Number(result[0].price) > 0) {
    return Number(result[0].price);
  }

  return 0;
}

type AccountBalance = {
  Code: string;
  Currency: string;
  CurrentBalance: number;
  CurrentRate: number;
  StartBalance: number;
  OrderBalance: number;
  Date: string; // YYYY-MM-DD
};

export async function recalcualateAccounts(
  connection: Connection,
  accounts: string[]
) {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD

  for (const account of accounts) {
    // 1️⃣ Aggregate from ctrans
    const result = await connection.query<{
      Curr: string;
      Total: number;
    }>(
      `
      SELECT Curr, SUM(
        CASE WHEN CrDr = 1 THEN Amount ELSE -Amount END
      ) AS Total
      FROM ctrans
      WHERE Code = ?
      GROUP BY Curr
      `,
      [account]
    );

    // 2️⃣ Loop through each currency for this account
    for (const row of result) {
      const { Curr, Total } = row;

      // Check if balance already exists
      const existing = await connection.query<{ "Current Balance": number }>(
        `SELECT "Current Balance" FROM balances WHERE Code = ? AND Currency = ?`,
        [account, Curr]
      );

      if (existing.length) {
        // Update existing balance
        await connection.query(
          `
          UPDATE balances
          SET "Current Balance" = ?,
              "Current Rate" = 1,  -- replace with rate if needed
              "Date" = ?
          WHERE Code = ? AND Currency = ?
          `,
          [Total, dateStr, account, Curr]
        );
      } else {
        // Insert new balance
        await connection.query(
          `
          INSERT INTO balances (
            Code, Currency, "Start Balance", "Current Balance",
            "Current Rate", "Order Balance", "Current Rate 2",
            Date, PostToShamel
          ) VALUES (?, ?, 0, ?, 1, 0, 1, ?, 0)
          `,
          [account, Curr, Total, dateStr]
        );
      }
    }
  }
}


export async function POST(req: NextRequest) {
  let connection: Connection | null = null;

  try {
    const body = await req.json();
    const orders: OrderPayload[] = body.orders;

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json(
        { error: "No orders provided" },
        { status: 400 }
      );
    }
    console.log(`Starting migration of ${orders.length} orders...`);
    console.log("Connecting to Pervasive database...");
    connection = await odbc.connect(ODBC_CONNECTION_STRING);


    const results: {
      order_id: number;
      order_number: string;
      status: "success" | "failed" | "skipped";
      reason?: string;
      voucherId?: string;
    }[] = [];

    for (const order of orders) {
      try {
        /* ===============================
           0️⃣ Skip already exported
        =============================== */
        if (order.is_exported === 1) {
          results.push({
            order_id: order.id,
            order_number: order.order_number,
            status: "skipped",
            reason: "الطلبية مرحلة مسبقا",
          });
          continue;
        }
        /* ===============================
     1️⃣ Check if manual voucher exists
  =============================== */
        if (order.reference_number !== "") {
          const existingVoucherId = await checkManualExists(connection, order.reference_number);

          if (existingVoucherId) {
            results.push({
              order_id: order.id,
              order_number: order.order_number,
              status: "skipped",
              reason: `رقم السند اليدوي موجود مسبقا (${existingVoucherId})`,
            });
            continue;
          }
        }
        if (!order.discount_amount) order.discount_amount = 0;
        console.log("Processing order:", order.order_number);
        const items = await getOrderItems(order.id);
        const missingItems: string[] = [];
        const missingAccounts: string[] = [];
        console.log("Migrating order:", order.order_number, "with items:", items.length);
        const Accounts: string[] = [];

        const Amounts: number[] = [];

        for (const item of items) {
          // 1️⃣ Check if item exists in stock
          console.log("Checking stock for item:", item.product_code);
          const exists = await checkStockExists(connection, item.product_code);
          console.log("Stock exists:", exists);
          if (!exists) missingItems.push(item.product_code);

          // 2️⃣ Check item account
          let itemAccount;
          if (exists == true) {
            console.log("Checking account for item:", item.product_code);
            if (order.order_type_id === 1) {
              itemAccount = await getItemAccount_sales(connection, item.product_code);
            } else {
              itemAccount = await getItemAccount_purchase(connection, item.product_code);
            }
            console.log("Item account:", itemAccount);
            if (!itemAccount) missingAccounts.push(item.product_code);
          }
        }

        // 3️⃣ If missing stock or accounts, mark order as failed
        if (missingItems.length > 0 || missingAccounts.length > 0) {
          let reason = "";
          if (missingItems.length > 0)
            reason += `يوجد اصناف في الطلبية غير موجودة: ${missingItems.join(", ")}. `;
          if (missingAccounts.length > 0)
            reason += `لا يوجد حساب للاصناف: ${missingAccounts.join(", ")}`;

          results.push({
            order_id: order.id,
            order_number: order.order_number,
            status: "failed",
            reason: reason.trim(),
          });
          continue; // skip this order
        }
        await connection.beginTransaction();
        log(`Transaction started for order ${order.order_number}`);

        /* ===============================
           1️⃣ Generate VoucherID
        =============================== */
        console.log(`Before getNextVoucherID...`);
        const voucherId = await getNextVoucherID(
          connection,
          order.order_number,
          order.order_type_id
        );
        console.log(`After getNextVoucherID...`);


        /* ===============================
           3️⃣ Insert strans
        =============================== */
        console.log(`Before insertStrans...`);
        let pos = 0;
        let insertOrder = 1;
        let total_amount = 0;
        for (const item of items) {
          const lineAmount = await insertStrans(
            connection,
            voucherId,
            order,
            item,
            insertOrder++,
            0,
            pos++
          );
          total_amount += lineAmount;
          Amounts.push(total_amount)
          await updateSitems(
            connection,
            order,
            item,
            order.order_type_id
          );

        }
        console.log(`After insertStrans...`);
        /* ===============================
           2️⃣ Insert cpage
        =============================== */
        console.log(`Before insertCPage...`);
        await insertCPage(connection, voucherId, order, 1, 0, total_amount);
        console.log(`After insertCPage...`);


        /* ===============================
           4️⃣ Insert ctrans
        =============================== */
        insertOrder = 0;

        // Customer
        await insertCtrans(
          connection,
          voucherId,
          order,
          total_amount,
          insertOrder++,
          0,
          order.order_type_id === 1 ? 1 : 2,
          order.customer_code
        );
        Accounts.push(order.customer_code);
        // VAT
        const vatAccount = await getVatAccount(connection, order.order_type_id);
        const vat = Math.max(order.vat_amount || 0, 0);
        if (vat > 0) {
          await insertCtrans(
            connection,
            voucherId,
            order,
            vat,
            insertOrder++,
            1,
            order.order_type_id === 1 ? 2 : 1,
            vatAccount
          );
          Accounts.push(vatAccount);
        }
        // Items
        let accPos = 2;
        for (const item of items) {


          const itemAccount =
            order.order_type_id === 1
              ? await getItemAccount_sales(connection, item.product_code)
              : await getItemAccount_purchase(connection, item.product_code);

          const amount =
            item.quantity * item.price - (item.discount || 0);

          await insertCtrans(
            connection,
            voucherId,
            order,
            Amounts[accPos - 2],
            insertOrder++,
            accPos++,
            order.order_type_id === 1 ? 2 : 1,
            itemAccount ?? ""
          );
          Accounts.push(itemAccount ?? "");
        }

        /* ===============================
           5️⃣ Insert spage
        =============================== */
        await insertSPage(connection, voucherId, order, 1, total_amount);
        await recalcualateAccounts(connection, Accounts);
        await connection.commit();
        const client = await pool.connect();
        try {
          await client.query(
            `UPDATE orders SET is_exported = 1 WHERE id = $1`,
            [order.id]
          );
        } finally {
          client.release();
        }
        log(`Transaction committed for order ${order.order_number}`);

        results.push({
          order_id: order.id,
          order_number: order.order_number,
          status: "success",
          voucherId,
        });
      } catch (orderError: any) {
        await connection.rollback();
        log(`Transaction rolled back for order ${order.order_number}`);

        results.push({
          order_id: order.id,
          order_number: order.order_number,
          status: "failed",
          reason: orderError?.message || "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Migration failed:", error);

    return NextResponse.json(
      { error: "حدث خطأ في ترحيل الطلبيات " + error },
      { status: 500 }
    );
  } finally {
    await connection?.close();
  }
}

