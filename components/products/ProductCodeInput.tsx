import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";
import ProductSearchPopup from "./ProductSearchPopup";

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
    onBlur?: () => void | Promise<void>;
    onSelectProductId?: (id: number) => void;
    codeLabel?: string;
    searchTitle?: string;
    priceCategoryId?: number;
    productTypes?: number[];
}

const ProductCodeInput = ({
    formData,
    visible,
    handleProductCodeChange,
    onBlur,
    onSelectProductId,
    codeLabel,
    searchTitle,
    priceCategoryId = 1,
    productTypes,
}: ProductCodeInputProps) => {
    const [showDialog, setShowDialog] = useState(false);

    useEffect(() => {
        if (!visible) {
            setShowDialog(false);
        }
    }, [visible]);

    const handleSelectProduct = (selectedProducts: Product[]) => {
        const product = Array.isArray(selectedProducts) ? selectedProducts[0] : undefined;
        if (!product) return;

        if (product.product_code) {
            handleProductCodeChange(product.product_code);
        }
        if (onSelectProductId) {
            onSelectProductId(product.id);
        }
        setShowDialog(false);
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
    const handleProductCodeBlur = async () => {
        if (formData.product_code != null) {
            const adjusted = adjustCode(formData.product_code ?? "")
            handleProductCodeChange(adjusted)
            if (onBlur) {
                await onBlur()
            }
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
                    placeholder=""
                    className="text-right w-full"
                    maxLength={8}
                    onBlur={handleProductCodeBlur}
                />
                <Button type="button" onClick={() => setShowDialog(true)}>
                    <Search className="w-4 h-4" />
                </Button>
            </div>

            <ProductSearchPopup
                visible={showDialog}
                onClose={() => setShowDialog(false)}
                onSelect={handleSelectProduct}
                priceCategoryId={priceCategoryId}
                ShowSelect={false}
                searchText={formData.product_code || ""}
                productTypes={productTypes}
                title={searchTitle}
            />
        </div>
    );
};

export default ProductCodeInput;
