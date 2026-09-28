export type PosCampaignLine = {
  id: number
  unit_id?: number | null
  quantity: number
  price: number
  discount: number
  campaign_discount?: number
  campaign_id?: number | null
  [key: string]: unknown
}

export type PosCampaign = {
  id: number
  start_date: string
  end_date: string
  time_type?: number
  from_time?: string | null
  to_time?: string | null
  type_id: number
  from_amount?: number
  to_amount?: number
  discount_perc?: number
  condition_items_opt?: number
  condition_items_val?: number
  added_items_option?: number
  added_items_value?: number
  price_class?: number
  max_campaigns?: number
  branch_ids?: number[]
  warehouse_ids?: number[]
  items: Array<{ item_id: number; unit_id?: number | null; quantity: number; discount: number; type: number }>
}

export type PosCampaignResult = {
  items: PosCampaignLine[]
  invoiceDiscount: number
  campaignId: number
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const lineGross = (line: PosCampaignLine) => Math.max(0, Number(line.price) * Number(line.quantity))
const lineManualDiscount = (line: PosCampaignLine) => lineGross(line) * Math.max(0, Number(line.discount || 0)) / 100
const baseTotal = (items: PosCampaignLine[]) => items.reduce((sum, item) => sum + lineGross(item) - lineManualDiscount(item), 0)
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
export const combinedDiscountPercent = (quantity: number, unitPrice: number, regularPercent: number, campaignAmount: number) => {
  const gross = Math.max(0, Number(quantity) * Number(unitPrice))
  if (!gross) return 0
  const discountAmount = gross * Math.max(0, Number(regularPercent || 0)) / 100 + Math.max(0, Number(campaignAmount || 0))
  return Math.min(100, Math.round(discountAmount / gross * 100 * 10000) / 10000)
}
const matchesOffer = (line: PosCampaignLine, offer: PosCampaign["items"][number]) =>
  Number(offer.item_id) === Number(line.id)
  && (offer.unit_id == null || Number(offer.unit_id) === Number(line.unit_id || 0))

const isActive = (campaign: PosCampaign, now: Date) => {
  const date = localDate(now)
  if (!campaign.start_date || !campaign.end_date || date < campaign.start_date.slice(0, 10) || date > campaign.end_date.slice(0, 10)) return false
  const time = now.toTimeString().slice(0, 5)
  if (Number(campaign.time_type) === 1) {
    const from = campaign.from_time ? `${campaign.start_date.slice(0, 10)}T${campaign.from_time.slice(0, 5)}` : `${campaign.start_date.slice(0, 10)}T00:00`
    const to = campaign.to_time ? `${campaign.end_date.slice(0, 10)}T${campaign.to_time.slice(0, 5)}` : `${campaign.end_date.slice(0, 10)}T23:59`
    return now >= new Date(from) && now <= new Date(to)
  }
  return !campaign.from_time || !campaign.to_time || (time >= campaign.from_time.slice(0, 5) && time <= campaign.to_time.slice(0, 5))
}

export function applyPosCampaigns(
  sourceItems: PosCampaignLine[],
  campaigns: PosCampaign[],
  scope: { branchId: number; warehouseId: number; priceClassId: number },
  now = new Date(),
): PosCampaignResult {
  const items = sourceItems.map(item => ({ ...item, campaign_discount: 0, campaign_id: null }))
  const active = campaigns.filter(campaign => {
    const branches = campaign.branch_ids || []
    const warehouses = campaign.warehouse_ids || []
    return isActive(campaign, now)
      && (!Number(campaign.price_class) || Number(campaign.price_class) === scope.priceClassId)
      && (!branches.length || branches.includes(scope.branchId))
      && (!warehouses.length || warehouses.includes(scope.warehouseId))
  })
  let invoiceDiscount = 0
  let campaignId = 0

  for (const campaign of active) {
    const buyItems = campaign.items.filter(item => Number(item.type) === 1)
    const addedItems = campaign.items.filter(item => Number(item.type) === 2)
    const maxCount = Math.max(1, Number(campaign.max_campaigns || 1))

    if (campaign.type_id === 1 || campaign.type_id === 5) {
      for (const offer of buyItems) {
        if (offer.quantity <= 0) continue
        const matching = items.filter(line => matchesOffer(line, offer))
        if (campaign.type_id === 5) {
          const line = matching[0]
          if (!line) continue
          const appliedQuantity = Math.min(line.quantity, offer.quantity)
          const discount = offer.discount * appliedQuantity / offer.quantity
          if (discount > 0) {
            line.campaign_discount = Math.min(roundMoney(discount), roundMoney(lineGross(line) - lineManualDiscount(line)))
            line.campaign_id = campaign.id
          }
          continue
        }
        const totalQuantity = matching.reduce((sum, line) => sum + line.quantity, 0)
        const applicationCount = Math.min(maxCount, Math.floor(totalQuantity / offer.quantity))
        let remainingQuantity = Math.min(applicationCount * offer.quantity, totalQuantity)
        for (const line of matching) {
          const appliedQuantity = Math.min(line.quantity, remainingQuantity)
          const discount = offer.discount * appliedQuantity / offer.quantity
          if (discount > 0) {
            line.campaign_discount = Math.min(roundMoney(discount), roundMoney(lineGross(line) - lineManualDiscount(line)))
            line.campaign_id = campaign.id
          }
          remainingQuantity -= appliedQuantity
          if (remainingQuantity <= 0) break
        }
      }
    }

    if (campaign.type_id === 2 || campaign.type_id === 4) {
      const ratios = buyItems.map(offer => {
        const quantity = items.filter(line => matchesOffer(line, offer)).reduce((sum, line) => sum + line.quantity, 0)
        return offer.quantity > 0 ? quantity / offer.quantity : 0
      })
      const option = Number(campaign.condition_items_opt || 1)
      let count = option === 2
        ? (ratios.filter(ratio => ratio >= 1).length >= Number(campaign.condition_items_val || 0) ? ratios.filter(ratio => ratio >= 1).length : 0)
        : option === 3
          ? Math.floor(ratios.reduce((sum, ratio) => sum + ratio, 0) / Math.max(1, Number(campaign.condition_items_val || 1)))
          : ratios.length ? Math.floor(Math.min(...ratios)) : 0
      count = Math.min(maxCount, count)
      const otherItemsTotal = items.filter(line => !buyItems.some(offer => matchesOffer(line, offer)))
        .reduce((sum, line) => sum + lineGross(line) - lineManualDiscount(line) - Number(line.campaign_discount || 0), 0)
      if (campaign.type_id === 4 && (otherItemsTotal < Number(campaign.from_amount || 0) || otherItemsTotal > Number(campaign.to_amount || 0))) count = 0
      if (count > 0) {
        for (const offer of buyItems) {
          const matching = items.filter(line => matchesOffer(line, offer))
          let remaining = offer.quantity * count
          for (const line of matching) {
            const quantity = Math.min(line.quantity, remaining)
            const discount = offer.quantity > 0 ? offer.discount * quantity / offer.quantity : 0
            line.campaign_discount = Math.min(roundMoney(discount), roundMoney(lineGross(line) - lineManualDiscount(line)))
            if (line.campaign_discount > 0) line.campaign_id = campaign.id
            remaining -= quantity
            if (remaining <= 0) break
          }
        }
        let remainingAdded = Number(campaign.added_items_option) === 2 || Number(campaign.added_items_option) === 3 ? Math.max(0, Number(campaign.added_items_value || 0)) : Infinity
        for (const [offerIndex, offer] of addedItems.entries()) {
          if (Number(campaign.added_items_option) === 2 && offerIndex >= remainingAdded) break
          const matching = items.filter(line => matchesOffer(line, offer))
          const needed = offer.quantity * count
          const allowed = Number(campaign.added_items_option) === 3 ? Math.min(needed, remainingAdded) : needed
          let remaining = allowed
          for (const line of matching) {
            const quantity = Math.min(line.quantity, remaining)
            const discount = offer.quantity > 0 ? offer.discount * quantity / offer.quantity : 0
            line.campaign_discount = Math.min(roundMoney(discount), roundMoney(lineGross(line) - lineManualDiscount(line)))
            if (line.campaign_discount > 0) line.campaign_id = campaign.id
            remaining -= quantity
            if (Number(campaign.added_items_option) === 3) remainingAdded -= quantity
            if (remaining <= 0) break
          }
        }
      }
    }
  }

  const currentTotal = baseTotal(items) - items.reduce((sum, item) => sum + Number(item.campaign_discount || 0), 0)
  const invoiceCampaign = active.find(campaign => [3, 4].includes(campaign.type_id)
    && currentTotal >= Number(campaign.from_amount || 0)
    && currentTotal <= Number(campaign.to_amount || 0))
  if (invoiceCampaign) {
    invoiceDiscount = roundMoney(currentTotal * Math.max(0, Number(invoiceCampaign.discount_perc || 0)) / 100)
    campaignId = invoiceCampaign.id
  }

  return { items, invoiceDiscount, campaignId }
}