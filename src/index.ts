import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import playerRoutes from './routes/players'

dotenv.config()

const app = express()
app.use(cors({ origin: 'http://localhost:5173'}))
app.use(express.json())

app.use('/players', playerRoutes)

const PORT = process.env.PORT || 3001
const MONGO_URI = process.env.MONGO_URI!

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB Atlas')
        app.listen(PORT, () => console.log(`API running on port ${PORT}`))
    })
    .catch(err => console.error('MongoDB connection error:', err))
