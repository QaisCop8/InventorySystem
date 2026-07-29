import { NextResponse } from 'next/server';
import { getTenantPool } from "@/lib/database";

function Inc_Code(code: string, prefix: string): string {
    let codeValue = code.replace(prefix, '');
    let codeArr = codeValue.split('');
    let i = codeArr.length - 1;

    while (i > 0 && codeArr[i] === ' ') i--;

    if (codeArr[i] === '9') {
        while (codeArr[i] === '9' && i > 0) {
            codeArr[i] = '0';
            i--;
        }
        if (codeArr[i] === '9') {
            codeArr[i] = 'A';
        } else {
            codeArr[i] = String.fromCharCode(codeArr[i].charCodeAt(0) + 1);
        }
    } else {
        if (codeArr[i] === '9') {
            codeArr[i] = 'A';
        } else {
            codeArr[i] = String.fromCharCode(codeArr[i].charCodeAt(0) + 1);
        }
    }

    const newCode = codeArr.join('');
    return newCode;
}
export async function GET() {
    const pool = await getTenantPool();
    const result = await pool.query(
        'SELECT product_code FROM products ORDER BY product_code DESC LIMIT 1'
    );
    const lastCode = result.rows[0]?.product_code ?? null;
    let prefix = 'I'; // set your prefix
    if(lastCode) prefix = lastCode[0];
    const newCode = lastCode ? `${prefix}${Inc_Code(lastCode, prefix)}` : `${prefix}0000001`;

    return NextResponse.json({ lastCode :newCode });
}