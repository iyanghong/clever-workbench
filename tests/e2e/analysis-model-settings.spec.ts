import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { electron } from './launch';
import { selectChoice } from './antd-controls';

test('明确允许的文件可经兼容服务提取，已有台账、识别的密码和旧目标始终留在本机', async ({}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-compatible-import-'));
  const filename =
    '业务管理平台交接清单（测试环境与仿真环境）—服务器、服务及访问入口汇总（示例）.csv';
  const file = path.join(directory, filename),
    calls: string[] = [];
  const server = createServer(async (req, res) => {
    if (
      req.method !== 'POST' ||
      req.url !== '/v1/chat/completions' ||
      req.headers.authorization !== 'Bearer fixture-service-key'
    ) {
      res.writeHead(403).end();
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push(body);
    const { messages } = JSON.parse(body);
    const content = messages.at(-1).content;
    let reply: unknown = { ok: true };
    if (content.includes('样例门户'))
      reply = { name: '样例门户', address: 'https://demo.example.invalid' };
    if (content.includes('"blocks"')) {
      const rows = JSON.parse(content).blocks[0].rows;
      const name = rows[1][1],
        url = rows[1][2];
      reply = {
        candidates: [
          {
            key: 'entry1',
            kind: 'access',
            name: { source: name.source, value: name.value },
            addresses: [
              {
                label: { source: name.source, value: name.value },
                url: { source: url.source, value: url.value },
              },
            ],
          },
        ],
      };
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          { finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(reply) } },
        ],
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const env: Record<string, string> = {
    ...process.env,
    CLEVER_WORKBENCH_DATA_DIR: directory,
    CWB_TEST_MOCK_KEYCHAIN: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    await fs.writeFile(
      file,
      '类型,名称,地址,密码\n访问入口,公开入口,https://new.example.invalid,known-secret-fixture\n',
    );
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      const id = (
        await window.desktop.mutate({ type: 'system.save', name: 'PRIVATE-SYSTEM-FIXTURE' })
      ).createdId!;
      const environment = await window.desktop.mutate({
        type: 'environment.save',
        systemId: id,
        name: 'PRIVATE-ENV-FIXTURE',
      });
      await window.desktop.mutate({ type: 'environment.save', systemId: id, name: '仿真' });
      await window.desktop.mutate({
        type: 'access.save',
        systemId: id,
        environmentId: environment.createdId!,
        name: '公开入口',
        notes: 'PRIVATE-OLD-NOTES',
        addresses: [{ label: '访问地址', url: 'https://private-old.example.invalid' }],
      });
    });
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.getByRole('menuitem', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '文件导入', exact: true }).click();
    const setup = page.getByRole('region', { name: '导入设置', exact: true });
    await expect(setup.getByRole('button', { name: '选择文件' })).toBeEnabled();
    await page.screenshot({ path: info.outputPath('setup-empty.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '选择文件', exact: true }).click();
    await expect(page.getByText(filename, { exact: true })).toHaveCount(1);
    await expect(setup.getByText('已在本机解析', { exact: true })).toBeVisible();
    await expect(setup.getByLabel('允许本文件交给指定第三方提取')).toHaveCount(0);
    await expect(setup.getByRole('button', { name: '开始本地分析' })).toHaveCount(0);
    const runtime = await page.evaluate(() => window.desktop.localLedgerImport.detectOllama());
    const localAction = setup.getByRole('button', {
      name: runtime.phase === 'missing' ? '前往安装 Ollama' : '启动 Ollama',
      exact: true,
    });
    await expect(localAction).toBeEnabled();
    await setup.screenshot({
      path: info.outputPath('setup-selected.png'),
      animations: 'disabled',
      scale: 'css',
    });
    const before = page.viewportSize();
    await page.setViewportSize({ width: 560, height: 640 });
    await page.emulateMedia({ colorScheme: 'dark', contrast: 'more', reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await setup.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const nameBox = await setup.getByText(filename, { exact: true }).boundingBox();
    const resetBox = await setup.getByRole('button', { name: '清空重选' }).boundingBox();
    expect(
      nameBox &&
        resetBox &&
        (nameBox.x + nameBox.width <= resetBox.x + 1 ||
          nameBox.y + nameBox.height <= resetBox.y + 1),
    ).toBe(true);
    await localAction.scrollIntoViewIfNeeded();
    await expect(localAction).toBeInViewport();
    await page.screenshot({ path: info.outputPath('setup-narrow-dark.png') });
    await page.setViewportSize(before ?? { width: 1280, height: 800 });
    await page.emulateMedia({
      colorScheme: 'light',
      contrast: 'no-preference',
      reducedMotion: 'no-preference',
    });
    await page.getByRole('button', { name: '管理分析模型' }).click();
    await page.getByRole('button', { name: '第三方服务', exact: true }).click();
    await page.getByLabel('服务名称', { exact: true }).fill('测试网关');
    await page.getByLabel('远端模型名').fill('fixture-chat');
    await page.getByLabel('模型接口地址').fill('http://127.0.0.1:' + port + '/v1');
    await page.getByLabel('API Key（可选）', { exact: true }).fill('fixture-service-key');
    await page.getByRole('button', { name: '测试连接' }).click();
    await page.getByRole('button', { name: '测试台账提取' }).click();
    await page.getByRole('button', { name: '保存配置' }).click();
    await expect(page.getByRole('status').filter({ hasText: '服务配置已保存' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('model-settings.png') });
    expect(await fs.readFile(path.join(directory, 'analysis-models.json'), 'utf8')).not.toContain(
      'fixture-service-key',
    );
    await page.getByRole('button', { name: '返回文件导入' }).click();
    await expect(page.getByText(filename, { exact: true }).first()).toBeVisible();
    const start = await page.evaluate(async () => ({
      s: await window.desktop.localLedgerImport.settings(),
      j: (await window.desktop.localLedgerImport.state()).job!,
    }));
    expect(start.s.service?.hasKey).toBe(true);
    expect(calls).toHaveLength(2);
    for (const p of [
      { fileId: start.j.id, allow: false, serviceRevision: start.s.service!.revision },
      { fileId: 'other-file', allow: true, serviceRevision: start.s.service!.revision },
      { fileId: start.j.id, allow: true, serviceRevision: 'old-service' },
    ]) {
      await expect(
        page.evaluate((p) => window.desktop.localLedgerImport.analyzeRemote(p as never), p),
      ).rejects.toThrow();
    }
    expect(calls).toHaveLength(2);
    await page.getByLabel('允许本文件交给指定第三方提取').check();
    await selectChoice(page.getByLabel('本次提取服务', { exact: true }), { label: '测试网关' });
    await page.getByRole('button', { name: '使用测试网关提取此文件' }).click();
    await page.getByRole('button', { name: '编辑候选 公开入口' }).click();
    await expect(page.getByText('完整同名', { exact: true })).toBeVisible();
    const scope = page.getByRole('combobox', { name: '候选适用环境' });
    async function setScope(label: string) {
      await scope.click();
      await page
        .locator('.ant-select-dropdown:visible .ant-select-item-option')
        .filter({ hasText: label })
        .click();
      await scope.press('Escape');
    }
    await setScope('仿真');
    await expect(page.getByRole('button', { name: '疑似重复 0', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '选为更新目标' })).toHaveCount(0);
    await setScope('系统通用');
    await expect(page.getByRole('button', { name: '疑似重复 1', exact: true })).toBeVisible();
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain('new.example.invalid');
    for (const v of [
      'PRIVATE-',
      'private-old.example.invalid',
      'known-secret-fixture',
      'fixture-service-key',
    ])
      expect(calls.join('')).not.toContain(v);
    await page.screenshot({ path: info.outputPath('duplicate-review.png') });
    await page.getByRole('button', { name: '保留为新增', exact: true }).click();
    await page.getByText('编辑候选字段与附属资料', { exact: true }).click();
    const section = page
      .locator('section.local-import-section')
      .filter({ has: page.getByRole('heading', { name: '访问地址', exact: true }) });
    await section.getByRole('button', { name: '增加地址' }).click();
    const second = section.getByLabel('地址 2 URL');
    await second.fill('sftp://files.example.invalid');
    await page.getByRole('button', { name: '确认并查看汇总' }).click();
    await expect(second).toBeFocused();
    await expect(section.getByRole('alert')).toContainText('地址仅支持 HTTP(S)');
    await second.fill('192.0.2.33:8080/demo/login.html');
    await second.press('Tab');
    await expect(second).toHaveValue('http://192.0.2.33:8080/demo/login.html');
    await expect(section.getByRole('alert')).toHaveCount(0);
    async function checkAddressButtons() {
      const input = (await second.boundingBox())!;
      const remove = (await section.getByRole('button', { name: '移除地址 2' }).boundingBox())!;
      expect(remove.x >= input.x + input.width + 5 || remove.y >= input.y + input.height + 5).toBe(
        true,
      );
    }
    await checkAddressButtons();
    await section.screenshot({ path: info.outputPath('addresses-wide.png'), scale: 'css' });
    await page.getByRole('button', { name: '返回技术台账' }).click();
    const leave = page.getByRole('dialog', { name: '放弃本次导入？' });
    await expect(leave.getByRole('button', { name: '继续校对' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(leave).toHaveCount(0);
    await expect(page.getByRole('button', { name: '返回技术台账' })).toBeFocused();
    await expect(second).toHaveValue('http://192.0.2.33:8080/demo/login.html');
    await page.setViewportSize({ width: 500, height: 640 });
    await page.emulateMedia({ colorScheme: 'dark', contrast: 'more', reducedMotion: 'reduce' });
    await checkAddressButtons();
    await section.screenshot({ path: info.outputPath('addresses-narrow.png'), scale: 'css' });
    await section.getByRole('button', { name: '移除地址 2' }).click();
    await expect(second).toHaveCount(0);
    await page.setViewportSize(before ?? { width: 1280, height: 800 });
    await page.emulateMedia({
      colorScheme: 'light',
      contrast: 'no-preference',
      reducedMotion: 'no-preference',
    });
    await page.getByRole('button', { name: '选为更新目标' }).click();
    await page.getByLabel('替换 访问地址', { exact: true }).check();
    await page.getByRole('button', { name: '确认并查看汇总' }).click();
    await expect(page.getByLabel('保存前汇总')).toContainText(
      'https://private-old.example.invalid',
    );
    await page.screenshot({ path: info.outputPath('remote-summary.png') });
    await page.getByRole('button', { name: '确认保存所选台账' }).click();
    await expect(page.getByText(/已新增 0 条、更新 1 条/)).toBeVisible();
    expect(
      await page.evaluate(
        async () => (await window.desktop.snapshot()).accessEntries[0].addresses[0].url,
      ),
    ).toBe('https://new.example.invalid');
    expect(calls).toHaveLength(3);
  } finally {
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
      .catch(() => {});
    await app.close();
    await new Promise<void>((r) => server.close(() => r()));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
