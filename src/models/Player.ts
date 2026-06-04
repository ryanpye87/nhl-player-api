import mongoose, { Schema, Document } from 'mongoose'

export interface IPlayer extends Document {
    id: number
    fullName: string
    teamAbbrev: string
    position: string
}

const PlayerSchema = new Schema({
    id: { type: Number, required: true, unique: true },
    fullName: { type: String, required: true },
    teamAbbrev: { type: String, required: true},
    position:  {type: String, required: true}, 
})

export default mongoose.model<IPlayer>('Player', PlayerSchema)