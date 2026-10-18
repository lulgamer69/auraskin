// The three records below are the complete mock order set from the assessment.
export const initialOrders = [
  {
    id: 'ORD-101',
    customer: 'Priya Sharma',
    product: 'Vitamin C Serum (30ml)',
    amount: 699,
    currency: 'INR',
    status: 'Out for Delivery',
    tracking: { carrier: 'BlueDart', trackingId: 'BD-982103' },
    note: 'Expected by 6 PM today',
  },
  {
    id: 'ORD-102',
    customer: 'Rahul Verma',
    product: 'Hydrating Sunscreen SPF 50',
    amount: 499,
    currency: 'INR',
    status: 'Delivered',
    tracking: { carrier: 'Delhivery', trackingId: 'DL-441029' },
    note: 'Delivered 14 days ago',
  },
  {
    id: 'ORD-103',
    customer: 'Ananya Patel',
    product: 'Green Tea Face Wash + Toner',
    amount: 850,
    currency: 'INR',
    status: 'Processing',
    tracking: null,
    note: 'Ordered 3 hours ago. Eligible for cancellation.',
  },
];

export function copyOrder(order) {
  return { ...order, tracking: order.tracking ? { ...order.tracking } : null };
}
