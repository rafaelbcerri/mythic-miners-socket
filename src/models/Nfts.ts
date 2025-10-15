import type { Document, Model, Types } from 'mongoose';
import { model, models, Schema } from 'mongoose';

export enum NftsCategory {
  relics = 'relics',
  equipments = 'equipments',
  beta = 'beta',
}

export interface NftsType extends Document {
  _id: Types.ObjectId;
  tokenId: number;
  category: NftsCategory;
  metadata: Record<string, any>;
  createdAt: Date;
}

type NftsModel = Model<NftsType>;
const NftsSchema = new Schema<NftsType, NftsModel>(
  {
    tokenId: { type: Number, required: true },
    category: { type: String, required: true },
    metadata: { type: Object, required: true },
  },
  {
    timestamps: true,
    collection: 'Nfts',
  },
);

// Create a composite index on category and tokenId
NftsSchema.index({ category: 1, tokenId: 1 }, { unique: true });

const Nfts =
  models.Nfts || model<NftsType, NftsModel>('Nfts', NftsSchema);
export default Nfts;
