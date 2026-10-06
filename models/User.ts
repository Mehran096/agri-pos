import { Schema, model, models } from "mongoose";
export interface IUser { email: string; password: string; name: string; role: "owner" | "worker"; }
const UserSchema = new Schema<IUser>({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  name: String,
  role: { type: String, enum: ["owner", "worker"], default: "worker" }
}, { timestamps: true });
export default models.User || model<IUser>("User", UserSchema);