// placeholder until this game lands
import { toast } from '../core/ui.js';
export async function createGame({ app, session }) {
  return { mount() { toast('Coming soon', 'info'); session.close?.(); app.go('hub'); }, unmount() {}, update() {} };
}
