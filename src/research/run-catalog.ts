import { config as loadDotenv } from 'dotenv';
import {
  assertNoExtraResearchArguments,
  executeResearchCatalog,
  prepareResearchCatalogCommand,
} from './command.js';
import { formatResearchCatalogLines } from './format.js';

loadDotenv({ quiet: true });

try {
  prepareResearchCatalogCommand(process.env);
  assertNoExtraResearchArguments(process.argv, 'research:catalog');
  executeResearchCatalog();
  for (const line of formatResearchCatalogLines()) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
