import { z } from 'zod';
import { environmentEnum, type FlagState } from '@/lib/db/schema';

export type Environment = FlagState['environment'];

/** dev, staging, prod — the enum is the single definition, so the schema and the UI cannot drift. */
export const ENVIRONMENTS: readonly Environment[] = environmentEnum.enumValues;

export const environmentSchema = z.enum(environmentEnum.enumValues);
