// src/app/(dashboard)/api-keys/page.tsx
'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Trash2, Plus, KeyRound, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { API_URL } from '@/lib/config/env';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string | null;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchKeys = async () => {
      try {
        const { data } = await apiClient.get('/api/api-keys');
        setKeys(data.keys || []);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        toast.error('加载失败', { description: err.message });
      }
    };
    fetchKeys();
  }, []);

  const generateKey = async () => {
    if (!newKeyName.trim()) return;
    setIsLoading(true);
    try {
      const { data } = await apiClient.post('/api/api-keys', { name: newKeyName });
      setKeys(prev => [data.key, ...prev]);
      setNewKeyName('');
      toast.success('API Key 已生成');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('生成失败', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('确定要删除吗？')) return;
    try {
      await apiClient.delete(`/api/api-keys/${id}`);
      setKeys(prev => prev.filter(k => k.id !== id));
      toast.success('已删除');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('删除失败', { description: err.message });
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('已复制到剪贴板');
  };

  return (
    <div className="page-shell pb-20">
      <PageHeader
        icon={KeyRound}
        title="开放平台"
        description="管理 API Key，用于微信、飞书、钉钉等第三方平台调用"
      />

      <Card>
        <CardHeader>
          <CardTitle>生成新 API Key</CardTitle>
          <CardDescription>创建用于第三方平台集成的访问密钥</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="keyName">Key 名称</Label>
              <Input
                id="keyName"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="如：微信机器人"
                className="mt-1"
              />
            </div>
            <Button onClick={generateKey} className="self-end" disabled={!newKeyName.trim() || isLoading}>
              <Plus className="w-4 h-4 mr-2" /> 生成
            </Button>
          </div>

          <div className="bg-muted/40 p-4 rounded-lg border border-border/40">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><Smartphone className="w-4 h-4 text-primary" /> 接入指南</h4>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>生成的 API Key 用于微信机器人、飞书 Bot、钉钉 Webhook 等平台</li>
              <li>请求时在 Header 中携带: <code className="bg-background px-1 py-0.5 rounded">X-API-Key: sk-xxx</code></li>
              <li>Base URL: <code className="bg-background px-1 py-0.5 rounded">{API_URL}/api/external</code></li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>已生成的 API Key</CardTitle>
          <CardDescription>管理已有的访问密钥，注意保密</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>最后使用</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    暂无 API Key
                  </TableCell>
                </TableRow>
              )}
              {keys.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                      {item.key.slice(0, 8)}••••{item.key.slice(-4)}
                    </code>
                  </TableCell>
                  <TableCell className="text-sm">{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-sm">{item.lastUsed ? new Date(item.lastUsed).toLocaleDateString() : '从未'}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => copyKey(item.key)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteKey(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}