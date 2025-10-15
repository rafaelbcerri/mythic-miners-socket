import type { Model, Types, Document } from 'mongoose';
import { model, models, Schema } from 'mongoose';

export interface PlayersType extends Document {
  _id: Types.ObjectId;
  address: string;
  life: number;
  energy: number;
  deaths: Date[];
  mapCreatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  map: {
    z1s1: number[];
    z1s2: number[];
    z2s1: number[];
    z2s2: number[];
    z3s1: number[];
    z3s2: number[];
    z4s1: number[];
    z4s2: number[];
    z5s1: number[];
    z5s2: number[];
  };
  ores: {
    Coal: number;
    Copper: number;
    Silver: number;
    Gold: number;
    Emerald: number;
    Sapphire: number;
    Mythril: number;
    Adamantium: number;
    Crownite: number;
  }
  amazonites: number;
  minerPoints: number;
  lastConnectedAt: Date;
  connectionId: string;
  position: { x: number; y: number };
  items: {
    energyDrink: number;
    teleportPill: number;
    fireResistancePotion: number;
    bomb: number;
    medkit: number;
  };
  amazoniteConverted: Date[];
  vipAmazoniteConverted: Date[];
}

type PlayersModel = Model<PlayersType>;
const PlayersSchema = new Schema<PlayersType, PlayersModel>(
  {
    address: { type: String, required: true, unique: true },
    life: { type: Number, required: true },
    energy: { type: Number, required: true },
    deaths: { type: [Date], required: true, default: [] },
    mapCreatedAt: { type: Date, required: false, default: null },
    map: {
      type: Object, required: true, default: {
        z1s1: [],
        z1s2: [],
        z2s1: [],
        z2s2: [],
        z3s1: [],
        z3s2: [],
        z4s1: [],
        z4s2: [],
        z5s1: [],
        z5s2: [],
      }
    },
    ores: {
      type: Object, required: true, default: {
        Coal: 0,
        Copper: 0,
        Silver: 0,
        Gold: 0,
        Emerald: 0,
        Sapphire: 0,
        Mythril: 0,
        Adamantium: 0,
        Crownite: 0,
      }
    },
    amazonites: { type: Number, required: true, default: 0 },
    minerPoints: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Miner points cannot be negative'],
      validate: {
        validator: function (value: number) {
          return value >= 0;
        },
        message: 'Miner points must be greater than or equal to 0'
      }
    },
    lastConnectedAt: { type: Date, default: null },
    connectionId: { type: String, required: false },
    position: { type: { x: Number, y: Number }, required: false, default: { x: -8, y: -1 } },
    items: {
      type: Object, required: true, default: {
        energyDrink: 0,
        teleportPill: 0,
        fireResistancePotion: 0,
        bomb: 0,
        medkit: 0,
      }
    },
    amazoniteConverted: { type: [Date], required: true, default: [] },
    vipAmazoniteConverted: { type: [Date], required: true, default: [] },
  },
  {
    timestamps: true,
    collection: 'Players',
  },
);

const Players =
  models.Players || model<PlayersType, PlayersModel>('Players', PlayersSchema);
export default Players;

