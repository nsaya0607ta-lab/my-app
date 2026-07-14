import { runDnfLike } from './packageManagerShared.js';
export default function yum(ctx){ return runDnfLike(ctx, 'yum'); }
