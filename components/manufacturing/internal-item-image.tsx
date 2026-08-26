type InternalItemImageProps = {
  item: {
    product_image?: string | null
    image_url?: string | null
    display_image?: string | null
    item_name?: string | null
    product_name?: string | null
  }
  size?: "sm" | "md"
}

export default function InternalItemImage({ item, size = "md" }: InternalItemImageProps) {
  const image = item.product_image || item.display_image || item.image_url
  const sizeClass = size === "sm" ? "h-10 w-10" : "h-16 w-16"

  return image ? (
    <img src={image} alt={item.item_name || item.product_name || "صورة الصنف"} className={`${sizeClass} shrink-0 rounded border bg-white object-cover`} />
  ) : (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded border bg-muted/30 px-1 text-center text-[10px] text-muted-foreground`}>لا صورة</div>
  )
}
