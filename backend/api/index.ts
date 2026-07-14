import 'dotenv/config';
import app from '../app';
import { assertProductionEnvironment } from '../config/env';

assertProductionEnvironment();

export default app;
