/**
 * WhatsApp selection routes (whatsapp-multiuser W6 fills this in). Intentionally empty in W5: it exists and is mounted
 * so W6 only adds routes here and never has to touch the shared composition files, which would collide with W5/W7.
 */
import { Router } from "express";

export function createWhatsAppSelectionRouter(): Router {
  return Router();
}
