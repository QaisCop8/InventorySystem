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
// طول كود الصنف المُولَّد تلقائياً: بادئة حرف واحد + 9 أرقام = 10 خانات إجمالاً (كان 8: بادئة + 7
// أرقام). أكواد قديمة أقصر من CODE_LENGTH (بيانات سابقة لهذا التغيير) تُوسَّع بأصفار بادئة قبل
// الزيادة أدناه بدل تركها تُنتج أكواداً بـ8 خانات إلى الأبد — الأكواد الفعلية المحفوظة مسبقاً بالجدول
// لا تُغيَّر، هذا يُطبَّق فقط على نسخة العمل المحسوبة هنا لتوليد الكود التالي.
const CODE_LENGTH = 10;

export async function GET() {
    const pool = await getTenantPool();
    const result = await pool.query(
        'SELECT product_code FROM products ORDER BY product_code DESC LIMIT 1'
    );
    const lastCode = result.rows[0]?.product_code ?? null;
    let prefix = 'I'; // set your prefix
    if (lastCode) prefix = lastCode[0];

    let baseCode = lastCode;
    if (baseCode && baseCode.length < CODE_LENGTH) {
        const suffix = baseCode.slice(prefix.length);
        baseCode = prefix + suffix.padStart(CODE_LENGTH - prefix.length, '0');
    }

    const newCode = baseCode
        ? `${prefix}${Inc_Code(baseCode, prefix)}`
        : `${prefix}${'0'.repeat(CODE_LENGTH - prefix.length - 1)}1`;

    return NextResponse.json({ lastCode: newCode });
}