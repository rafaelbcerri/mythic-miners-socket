import type { Model, Types, Document } from 'mongoose';
import { model, models, Schema } from 'mongoose';

export interface SubscriptionType extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  address: string;
  plan: string; // Ex: "vip_1_month", "vip_3_months", "vip_6_months", "vip_infinity"
  startDate: Date; // Quando adquiriu
  endDate: Date;   // Quando expira
  autoRenew?: boolean; // Optional: renovação automática
  createdAt: Date;
  updatedAt: Date;
}

type SubscriptionModelType = Model<SubscriptionType>;

const SubscriptionSchema = new Schema<SubscriptionType, SubscriptionModelType>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    address: { type: String, required: true, index: true },
    plan: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    autoRenew: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    collection: 'Subscriptions',
  },
);

const SubscriptionModel = models.Subscriptions ||
  model<SubscriptionType, SubscriptionModelType>('Subscriptions', SubscriptionSchema);

export default SubscriptionModel; 