/**
 * A2 – submit_alert input (owner: Bushra).
 *
 * Claude writes only the wording and picks action types; every id and number on the final
 * alert is filled in by code (./assemble). SDK-free.
 */
import { z } from 'zod';
import { ActionTypeSchema, AlertCardDataSchema } from '@gridrisk/shared';

export const SubmitAlertSchema = AlertCardDataSchema.pick({ title: true, points: true }).extend({
  actionTypes: z.array(ActionTypeSchema),
});

export type SubmitAlertInput = z.infer<typeof SubmitAlertSchema>;
