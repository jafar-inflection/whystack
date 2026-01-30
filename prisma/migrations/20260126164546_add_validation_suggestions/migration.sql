-- AlterTable
ALTER TABLE "Hypothesis" ADD COLUMN     "validationSuggestions" JSONB,
ADD COLUMN     "validationSuggestionsAt" TIMESTAMP(3);
