import { expect, test, type Page } from '@playwright/test';
import { SAMPLES } from '../src/data/samples';

const progressStorage = {
  state: {
    onboarded: true,
    visitedKnowledgeBases: [],
    completedDemos: [],
    detectionHistory: [],
    totalPoints: 0,
  },
  version: 1,
};

const instruments = [
  {
    id: 'refractometer',
    label: '折射仪',
    saveTestId: 'refractometer-save',
    prepare: async () => {},
  },
  {
    id: 'polariscope',
    label: '偏光镜',
    saveTestId: 'polariscope-save',
    prepare: async () => {},
  },
  {
    id: 'spectroscope',
    label: '分光镜',
    saveTestId: 'spectroscope-save',
    prepare: async ({ page }: { page: Page }) => {
      await page.getByTestId('spectroscope-no-absorption').click();
      await expect(page.getByTestId('spectroscope-no-absorption-summary')).toBeVisible();
    },
  },
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem('gem-lab-progress-v1', JSON.stringify(value));
  }, progressStorage);
});

test.describe('unknown sample detection matrix', () => {
  for (const sample of SAMPLES) {
    for (const instrument of instruments) {
      test(`${sample.id} stays hidden and can submit in ${instrument.id}`, async ({ page }) => {
        const runtimeErrors: string[] = [];
        page.on('pageerror', (error) => runtimeErrors.push(error.message));

        await page.goto(`/demo/${instrument.id}?sample=${sample.id}&mode=detection&qa=ready`);
        await expect(page.getByTestId('unknown-sample-label').first()).toBeVisible();
        await instrument.prepare({ page });

        const pageText = await page.locator('body').innerText();
        expect(pageText).toContain('未知样品');
        expect(pageText).toContain(instrument.label);
        expect(pageText).not.toContain(sample.name);
        expect(pageText).not.toMatch(/Application error|Cannot read|TypeError|ReferenceError|Error:/);
        expect(runtimeErrors).toEqual([]);
        await expect(page.getByTestId(instrument.saveTestId)).toBeEnabled();
      });
    }
  }
});
