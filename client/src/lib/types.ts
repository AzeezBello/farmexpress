export type Role = 'FARMER' | 'BUYER' | 'INDUSTRY' | 'ADMIN';
export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type OrderStatus = 'PENDING' | 'PAID' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export type User = { id: string; name: string; email: string; role: Role; kycStatus: KycStatus; businessName?: string | null; farmLocation?: string | null; createdAt?: string };

export type Product = {
  id: string; name: string; description: string; price: string | number; quantity: number; category: string;
  imageUrl?: string | null; location?: string | null; farmerId?: string;
  farmer: { id?: string; name: string; farmLocation?: string | null; kycStatus?: KycStatus };
  rating?: number | null; reviewCount?: number;
};

export type OrderItem = { id: string; productId: string; quantity: number; unitPrice: string; product: { id: string; name: string; imageUrl?: string | null; farmerId: string; category: string } };
export type Order = {
  id: string; status: OrderStatus; totalPrice: string; deliveryOption: 'DELIVERY' | 'PICKUP'; deliveryAddress?: string | null; createdAt: string;
  items: OrderItem[]; buyer: { id: string; name: string };
  payment?: { status: 'PENDING' | 'SUCCESSFUL' | 'FAILED'; paymentMethod: string; channel?: string | null; paidAt?: string | null; reference?: string | null } | null;
};

export type Analytics = { users: number; farmers: number; pendingKyc: number; products: number; orders: number; pendingOrders: number; revenue: number; refundsDue: number };
