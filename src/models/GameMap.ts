import type { Model, Types, Document } from 'mongoose';
import { model, models, Schema } from 'mongoose';

export interface GameMapType extends Document {
  _id: Types.ObjectId;
  address: string;
  map: number[];
  zone: "z1s1" | "z1s2" | "z2s1" | "z2s2" | "z3s1" | "z3s2" | "z4s1" | "z4s2" | "z5s1" | "z5s2";
  createdAt: Date;
  updatedAt: Date;
}

type GameMapModel = Model<GameMapType>;
const GameMapSchema = new Schema<GameMapType, GameMapModel>(
  {
    address: { type: String, required: true },
    map: { type: [Number], required: false, default: [] },
    zone: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: 'GameMap',
  },
);

GameMapSchema.index({ address: 1, zone: 1 }, { unique: true });

const GameMap =
  models.GameMap || model<GameMapType, GameMapModel>('GameMap', GameMapSchema);
export default GameMap;