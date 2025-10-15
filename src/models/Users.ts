import type { Model, Types, Document } from 'mongoose';
import { model, models, Schema } from 'mongoose';


export interface UsersType extends Document {
  _id: Types.ObjectId;
  address: string;
  referralId: string;
  position: number;
  points: number;
  createdAt: Date;
  bannedAt?: Date;
  email?: string;
  source?: string;
  inventory?: { item: string; quantity: number; isNFT: boolean }[];
}

type UsersModel = Model<UsersType>;
const UsersSchema = new Schema<UsersType, UsersModel>(
  {
    address: { type: String, required: true, unique: true },
    referralId: { type: String, required: true, unique: true },
    points: { type: Number },
    position: { type: Number },
    bannedAt: { type: Date },
    email: { type: String },
    source: { type: String },
    inventory: [
      {
        item: {
          type: String,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 0,
        },
        isNFT: {
          type: Boolean,
          required: false,
          default: false,
        },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'Users',
  },
);

const Users =
  models.Users || model<UsersType, UsersModel>('Users', UsersSchema);
export default Users;
