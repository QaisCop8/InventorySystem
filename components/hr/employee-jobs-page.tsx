"use client"
import { DefinitionsPage, type Field } from "./hr-shared"
const active: Field = { key: "is_active", label: "فعال", type: "checkbox" }
export function EmployeeJobsPage() { return <DefinitionsPage resource="jobs" title="الوظائف" fields={[{ key: "code", label: "الرمز", required: true }, { key: "name", label: "اسم الوظيفة", required: true, span: "sm:col-span-2" }, active]} /> }
