import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Product {
    id: number;
    product_code?: string;
    product_name?: string;
    main_unit?: string;
    selling_price?: number;
    last_purchase_price?: number;
    units?: any[];
    stores?: any[];
    [key: string]: any;
}

interface ProductCodeInputProps {
    formData: {
        id: number;
        product_code?: string;
        product_name?: string;
        units?: any[];
        stores?: any[];
        [key: string]: any;
    };
    visible: any;
    handleProductCodeChange: (code: string) => void;
    onSelectProductId?: (id: number) => void; // <-- new callback
    codeLabel?: string;
    searchTitle?: string;
}

const ProductCodeInput = ({
    formData,
    visible,
    handleProductCodeChange,
    onSelectProductId,
    codeLabel,
    searchTitle,
}: ProductCodeInputProps) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [showDialog, setShowDialog] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!visible) return; // attach only when dialog is open

        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                setShowDialog(false) // close only your nested popup
            }

        };

        window.addEventListener("keydown", handler, true); // ✅ capture phase
        return () => window.removeEventListener("keydown", handler, true);
    }, [visible]);

    useEffect(() => {
        const fetchProducts = async () => {
            setIsLoading(true);
            try {
                const res = await fetch("/api/inventory/products");
                const data = await res.json();
                if (!res.ok) {
                    console.error("Failed fetching products:", data);
                    setProducts([]);
                    return;
                }
                setProducts(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error(err);
                setProducts([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProducts();
    }, []);

    const filteredProducts = products.filter(
        (p) =>
            p.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.product_code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelectProduct = (product: Product) => {

        // Return the selected product id to parent
        if (onSelectProductId) onSelectProductId(product.id);

        setShowDialog(false);
        setSearchTerm("");
    };

    const adjustCode = (code: string, codeLen: number = 8): string => {
        if (!code || !code.trim()) return '';

        code = code.trim().toUpperCase();

        // Separate prefix (letters) and numeric part
        const match = code.match(/^([A-Z]*)(\d*)$/);
        if (!match) return code; // invalid pattern (contains symbols)

        let [, prefix, numPart] = match;
        const padLen = Math.max(codeLen - prefix.length, 0);
        const paddedNum = numPart.padStart(padLen, '0');

        return `${prefix}${paddedNum}`;
    };
    const handleProductCodeBlur = () => {
        console.log("formData.product_code ", formData.product_code)
        if (formData.product_code != null) {
            formData.product_code = adjustCode(formData.product_code ?? "")
            handleProductCodeChange(formData.product_code)
        }
    }
    return (
        <div className="col-span-12 md:col-span-2 relative">
            <Label htmlFor="product_code" className="text-sm font-medium">
                {codeLabel ?? "رقم الصنف *"}
            </Label>

            <div className="flex gap-2">
                <Input
                    id="product_code"
                    value={formData.product_code || ""}
                    onChange={(e) => {
                        const cleanValue = e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
                        handleProductCodeChange(cleanValue.toUpperCase())
                    }
                    }
                    placeholder="أرقام وحروف إنجليزية فقط"
                    className="text-right w-full"
                    maxLength={8}
                    onBlur={handleProductCodeBlur}
                />
                <Button type="button" onClick={() => setShowDialog(true)}>
                    🔍
                </Button>
            </div>

            {showDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl border border-gray-300 p-6"
                        dir="rtl">
                        <h3 className="text-lg font-semibold mb-4 text-right">{searchTitle ?? "بحث الأصناف"}</h3>

                        <Input
                            type="text"
                            placeholder="ابحث عن صنف..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="mb-4 p-2 border border-gray-300 rounded w-full text-right"
                        />

                        <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded p-1">
                            {isLoading ? (
                                <div className="text-center p-3 text-gray-500">جاري التحميل...</div>
                            ) : filteredProducts.length > 0 ? (
                                filteredProducts.map((product) => (
                                    <button
                                        key={product.id}
                                        onMouseDown={() => handleSelectProduct(product)}
                                        className="w-full text-right p-2 rounded hover:bg-blue-100 transition"
                                    >
                                        <div className="font-medium">{product.product_code} - {product.product_name}</div>
                                        <div className="text-sm text-gray-500">
                                            {product.first_price} -{" "} {product.currency_name}
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="text-center text-gray-500 p-3">لا توجد نتائج</div>
                            )}
                        </div>

                        <div className="flex justify-end mt-4">
                            <Button variant="outline" onClick={() => setShowDialog(false)}>
                                إغلاق
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductCodeInput;
