import { guarded } from '../../../services/quanta-oauth/http';
import { bootstrap } from '../../../services/quanta-oauth/session';
export default defineEventHandler(event => guarded(event, () => bootstrap(event)));
