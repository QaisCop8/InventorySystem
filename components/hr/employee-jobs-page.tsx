"use client"
import { tr } from "@/lib/i18n"
import { DefinitionsPage, type Field } from "./hr-shared"
const active: Field = { key: "is_active", label: tr("فعال"), type: "checkbox" }
export function EmployeeJobsPage() { return <DefinitionsPage resource="jobs" title={tr("الوظائف")} fields={[{ key: "code", label: tr("الرمز"), required: true }, { key: "name", label: tr("اسم الوظيفة"), required: true, span: "sm:col-span-2" }, active]} /> }
