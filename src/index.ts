import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import playerRoutes from './routes/players'
import statsRoutes from './routes/stats'

dotenv.config()

const app = express()
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }))
app.use(express.json())

app.use('/players', playerRoutes)
app.use('/players', statsRoutes)

const PORT = process.env.PORT || 3001
const MONGO_URI = process.env.MONGO_URI!

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB Atlas')
        app.listen(PORT, () => console.log(`API running on port ${PORT}`))
    })
    .catch(err => console.error('MongoDB connection error:', err))
