import { NextResponse } from 'next/server';
import { getTenantPool } from "@/lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
// طول كود الصنف المُولَّد تلقائياً: بادئة حرف واحد + 9 أرقام = 10 خانات إجمالاً (كان 8: بادئة + 7
// أرقام). أكواد قديمة أقصر من CODE_LENGTH (بيانات سابقة لهذا التغيير) تُوسَّع بأصفار بادئة قبل
// الزيادة أدناه بدل تركها تُنتج أكواداً بـ8 خانات إلى الأبد — الأكواد الفعلية المحفوظة مسبقاً بالجدول
// لا تُغيَّر، هذا يُطبَّق فقط على نسخة العمل المحسوبة هنا لتوليد الكود التالي.
const CODE_LENGTH = 10;

const nextCodeAfter = (lastCode: string | null, defaultPrefix: string) => {
    const prefix = lastCode ? lastCode[0] : defaultPrefix;
    let baseCode = lastCode;
    if (baseCode && baseCode.length < CODE_LENGTH) {
        const suffix = baseCode.slice(prefix.length);
        baseCode = prefix + suffix.padStart(CODE_LENGTH - prefix.length, '0');
    }
    return baseCode
        ? `${prefix}${Inc_Code(baseCode, prefix)}`
        : `${prefix}${'0'.repeat(CODE_LENGTH - prefix.length - 1)}1`;
}

// ?type=services: آخر رقم خدمة (products.type = 2) + 1؛ وإلا آخر رقم صنف (غير الخدمات) + 1.
// الرقم الناتج يُتخطّى إن كان مستخدماً مسبقاً لأي صنف/خدمة (قد تشترك البادئة بين النوعين).
export async function GET(request: Request) {
    const databaseUrl = (process.env.DATABASE_URL || "").trim();
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
    const isService = new URL(request.url).searchParams.get("type") === "services";
    const defaultPrefix = isService ? 'S' : 'I';

    if (isBuildPhase || !databaseUrl) {
        return NextResponse.json({ lastCode: `${defaultPrefix}000000001` });
    }

    try {
        const pool = await getTenantPool();
        const result = await pool.query(
            `SELECT product_code FROM products
             WHERE ${isService ? 'COALESCE(type, 1) = 2' : 'COALESCE(type, 1) <> 2'} AND COALESCE(product_code, '') <> ''
             ORDER BY product_code DESC LIMIT 1`
        );
        let newCode = nextCodeAfter(result.rows[0]?.product_code ?? null, defaultPrefix);
        for (let attempt = 0; attempt < 50; attempt += 1) {
            const taken = await pool.query('SELECT 1 FROM products WHERE UPPER(product_code) = UPPER($1) LIMIT 1', [newCode]);
            if (!taken.rows.length) break;
            newCode = nextCodeAfter(newCode, defaultPrefix);
        }

        return NextResponse.json({ lastCode: newCode });
    } catch (error) {
        console.error("[getLastProductCode] Failed to resolve latest product code:", error);
        return NextResponse.json({ lastCode: "I0000000001" });
    }
}