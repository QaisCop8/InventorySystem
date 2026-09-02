"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface SalesmanListItem {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export default function Salesmen() {
  const [salesmen, setSalesmen] = useState<SalesmanListItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);

  const [form, setForm] = useState({
    code: "",
    name: "",
    is_active: true,
  });

  // -----------------------------------------
  // Load salesmen
  // -----------------------------------------
  async function loadSalesmen() {
  const res = await fetch("/api/salesmen");
  const json = await res.json();

  setSalesmen(Array.isArray(json.data) ? json.data : []);
}

  useEffect(() => {
    loadSalesmen();
  }, []);

  // -----------------------------------------
  // Submit form (Add / Edit)
  // -----------------------------------------
  async function handleSubmit(e: any) {
    e.preventDefault();

    const method = editingId ? "PUT" : "POST";
    const url = "/api/salesmen";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id: editingId }),
    });

    const result = await res.json();

    if (res.ok) {
      loadSalesmen();
      setShowForm(false);
      setEditingId(null);
      setForm({ code: "", name: "", is_active: true });
    } else {
      alert(result.error);
    }
  }

  // -----------------------------------------
  // Edit
  // -----------------------------------------
  function handleEdit(s: any) {
    setEditingId(s.id);
    setShowForm(true);
    setForm({
      code: s.code,
      name: s.name,
      is_active: s.is_active,
    });
  }

  return (
    <Card dir="rtl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            مندوبي المبيعات ({salesmen.length})
          </CardTitle>

          <Button
            className="erp-btn-primary"
            size="sm"
            onClick={() => {
              setShowForm(!showForm);
              setEditingId(null);
              setForm({ code: "", name: "", is_active: true });
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            إضافة مندوب
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* Add / Edit Form */}
        {showForm && (
          <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
            <h3 className="font-heading font-semibold mb-4 text-right">
              {editingId ? "تعديل بيانات المندوب" : "إضافة مندوب جديد"}
            </h3>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-4">
                
                {/* Code */}
                <div className="text-right">
                  <Label className="erp-label text-right block">
                    كود المندوب *
                  </Label>
                  <Input
                    required
                    maxLength={8}
                    className="erp-input text-right"
                    placeholder="12345"
                    value={form.code}
                    onChange={(e) =>
                      setForm({ ...form, code: e.target.value })
                    }
                  />
                </div>

                {/* Name */}
                <div className="text-right">
                  <Label className="erp-label text-right block">
                    اسم المندوب *
                  </Label>
                  <Input
                    required
                    maxLength={100}
                    className="erp-input text-right"
                    placeholder="اسم المندوب"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex justify-start gap-2 pt-2">
                <Button type="submit" size="sm" className="erp-btn-primary">
                  حفظ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setForm({ code: "", name: "", is_active: true });
                  }}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Salesmen List */}
        <div className="space-y-3">
          {salesmen.map((s, index) => (
            <div
              key={s.id}
              className={cn(
                "p-4 rounded-lg border transition-all cursor-pointer",
                index === currentIndex
                  ? "bg-primary/10 border-primary shadow-sm"
                  : "bg-background hover:bg-muted/50"
              )}
              onClick={() => setCurrentIndex(index)}
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1 text-right">
                  <h4 className="font-heading font-semibold">{s.name}</h4>
                  <p className="text-sm text-muted-foreground">{s.code}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(s)}>
                    <Edit className="h-3 w-3" />
                  </Button>

                  <Badge variant={s.is_active ? "default" : "secondary"}>
                    {s.is_active ? "نشط" : "غير نشط"}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>

      </CardContent>
    </Card>
  );
}
