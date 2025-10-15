import type { Model, Types, Document } from 'mongoose';
import { model, models, Schema } from 'mongoose';

export interface AirdropInventoryType extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  userAddress: string;
  originalItem: string;
  equipmentType: string;
  rarity: string;
  grade: string;
  tokenId?: number;
  metadata: {
    image: string;
    name: string;
    description: string;
    attributes: Array<{
      trait_type: string;
      value: string | number;
      display_type?: string;
    }>;
  };
  mintedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type AirdropInventoryModel = Model<AirdropInventoryType>;

const AirdropInventorySchema = new Schema<AirdropInventoryType, AirdropInventoryModel>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'Users' },
    userAddress: { type: String, required: true },
    originalItem: { type: String, required: true },
    equipmentType: { type: String, required: true },
    tokenId: { type: Number, required: false },
    mintedAt: { type: Date, required: false },
    metadata: {
      image: { type: String, required: true },
      name: { type: String, required: true },
      description: { type: String, required: true },
      attributes: [{
        trait_type: { type: String, },
        value: { type: Schema.Types.Mixed, },
        display_type: { type: String }
      }]
    }
  },
  {
    timestamps: true,
    collection: 'AirdropInventory',
  },
);

// Create compound index for efficient queries
AirdropInventorySchema.index({ userId: 1, originalItem: 1 });
AirdropInventorySchema.index({ userAddress: 1 });
AirdropInventorySchema.index({ equipmentType: 1, rarity: 1, grade: 1 });

const AirdropInventory = models.AirdropInventory ||
  model<AirdropInventoryType, AirdropInventoryModel>('AirdropInventory', AirdropInventorySchema);

export default AirdropInventory; 