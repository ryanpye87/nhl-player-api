import mongoose, {Schema, Document} from 'mongoose'

export interface IPlayerCache extends Document {
    playerId: number
    data: object
    cachedAt: Date
}

const PlayerCacheSchema = new Schema({
    playerId: { type: Number, required: true, unique: true },
    data: { type: Schema.Types.Mixed, required: true },
    cachedAt: { type: Date, default: Date.now },
})

export default mongoose.model<IPlayerCache>('PlayerCache', PlayerCacheSchema)