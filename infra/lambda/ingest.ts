/**
 * Compatibility entrypoint for the scheduled ingest Lambda.
 * The CDK stack points directly at the engine handler so the data normalizers
 * and DynamoDB persistence stay in one implementation.
 */
export { handler } from '../../packages/engine/src/ingest/handler';
