import { registerRoomHandlers } from './roomHandlers.js';
import { registerGameHandlers } from './gameHandlers.js';

export function registerSocketHandlers(io, socket) {
  registerRoomHandlers(io, socket);
  registerGameHandlers(io, socket);
}
