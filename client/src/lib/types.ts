export type Role = 'FARMER' | 'BUYER' | 'INDUSTRY' | 'ADMIN';
export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type KycDocType = 'NATIONAL_ID' | 'CAC_CERTIFICATE' | 'FARM_PERMIT' | 'TAX_ID';
export type OrderStatus = 'PENDING' | 'PAID' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  kycStatus: KycStatus;
  businessName?: string | null;
  farmLocation?: string | null;
  kycDocumentType?: KycDocType | null;
  kycDocumentUrl?: string | null;
  kycSubmittedAt?: string | null;
  kycNote?: string | null;
  createdAt?: string;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  price: string | number;
  quantity: number;
  category: string;
  imageUrl?: string | null;
  location?: string | null;
  farmerId?: string;
  farmer: { id?: string; name: string; farmLocation?: string | null; kycStatus?: KycStatus };
  rating?: number | null;
  reviewCount?: number;
};

export type OrderEvent = {
  id: string;
  status: OrderStatus;
  title: string;
  note?: string | null;
  location?: string | null;
  actorName?: string | null;
  createdAt: string;
};

export type OrderItem = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  product: { id: string; name: string; imageUrl?: string | null; farmerId: string; category: string };
};

export type Order = {
  id: string;
  status: OrderStatus;
  totalPrice: string;
  deliveryOption: 'DELIVERY' | 'PICKUP';
  deliveryAddress?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingNote?: string | null;
  estimatedDelivery?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  items: OrderItem[];
  buyer: { id: string; name: string; email?: string };
  payment?: {
    status: PaymentStatus;
    paymentMethod: string;
    channel?: string | null;
    paidAt?: string | null;
    reference?: string | null;
    refundedAt?: string | null;
    refundReference?: string | null;
    refundReason?: string | null;
  } | null;
  events?: OrderEvent[];
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  orderId?: string | null;
  readAt?: string | null;
  emailSent: boolean;
  smsSent: boolean;
  createdAt: string;
};

export type AuditLogItem = {
  id: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: 'USER' | 'ORDER' | 'PRODUCT' | 'PAYMENT';
  targetId: string;
  summary: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: { id: string; name: string; email: string; role: Role } | null;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type Analytics = {
  users: number;
  farmers: number;
  pendingKyc: number;
  products: number;
  orders: number;
  pendingOrders: number;
  revenue: number;
  refundsDue: number;
  refundedCount?: number;
  auditLogs?: number;
};
