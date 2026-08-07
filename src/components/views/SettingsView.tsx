import React, { useState, useEffect } from 'react';
import { Save, Clock, Key, MessageCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { Skeleton } from '../ui/Skeleton';

export default function SettingsView() {
  const [form, setForm] = useState({ scanInterval: 10, telegramChatId: '', metadataApiKey: '', debugMode: 0, providerType: 'NONE', providerUrl: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (!data.error && data) {
          setForm({
            scanInterval: data.scanInterval || 10,
            telegramChatId: data.telegramChatId || '',
            metadataApiKey: data.metadataApiKey || '',
            debugMode: data.debugMode || 0,
            providerType: data.providerType || 'NONE',
            providerUrl: data.providerUrl || ''
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      window.dispatchEvent(new Event('settings-updated'));
      toast('Settings saved successfully. Services updated.', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      // First save current form settings
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      window.dispatchEvent(new Event('settings-updated'));

      const res = await fetch('/api/telegram/test', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast('Test notification sent to Telegram with detail link!', 'success');
      } else {
        toast(data.error || 'Failed to send Telegram test message', 'error');
      }
    } catch (e: any) {
      toast(e.message || 'Error sending Telegram test message', 'error');
    } finally {
      setTestingTelegram(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h2>
        <p className="text-gray-500 text-sm mt-1">Configure background services and external API integrations.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-500" />
              Data Provider Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Provider Type
              </label>
              <select
                value={form.providerType}
                onChange={e => setForm({...form, providerType: e.target.value})}
                className="w-full max-w-xs px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              >
                <option value="NONE">None (Disabled)</option>
                <option value="PIRATEBAY">The Pirate Bay (Search API)</option>
                <option value="MOCK">Mock Provider (For testing)</option>
                <option value="RSS">RSS Feed</option>
              </select>
            </div>

            {form.providerType === 'PIRATEBAY' && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-800">
                <strong>Pirate Bay Alert Mode Active:</strong> Scans The Pirate Bay for releases matching your watchlist items. <strong>No downloads are performed</strong> — the bot simply sends a Telegram alert with release info so you know it's available and can watch on Netflix, HBO Max, or your favorite platform.
              </div>
            )}
            
            {form.providerType === 'RSS' && (
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  RSS Feed URL
                </label>
                <input 
                  type="url" 
                  required
                  value={form.providerUrl} 
                  onChange={e => setForm({...form, providerUrl: e.target.value})} 
                  className="w-full max-w-md px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                  placeholder="https://example.com/rss"
                />
              </div>
            )}

            <div className="pt-2 border-t border-gray-100">
              <Button type="button" variant="outline" onClick={async () => {
                try {
                  const res = await fetch('/api/provider/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ providerType: form.providerType, providerUrl: form.providerUrl })
                  });
                  const data = await res.json();
                  if (data.error) throw new Error(data.error);
                  toast(`Connection Status: Success. Items Found: ${data.itemsFound}`, 'success');
                } catch (e: any) {
                  toast(`Errors: ${e.message}`, 'error');
                }
              }}>
                Test Provider
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500" />
              Scanner Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Scan Interval (minutes)
              </label>
              <p className="text-sm text-gray-500 mb-3">How often should the background scheduler scan configured providers?</p>
              <input 
                type="number" 
                min="1"
                required
                value={form.scanInterval} 
                onChange={e => setForm({...form, scanInterval: parseInt(e.target.value) || 10})} 
                className="w-full max-w-xs px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-indigo-500" />
              Telegram Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-indigo-50/50 rounded-lg border border-indigo-100 flex gap-3">
              <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0" />
              <div className="text-sm text-indigo-900">
                Ensure <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-100 text-xs font-mono">TELEGRAM_BOT_TOKEN</code> is set in your Render environment variables. Send <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-100 text-xs font-mono">/start</code> to your bot to get your Chat ID.
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Chat ID
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input 
                  type="text" 
                  value={form.telegramChatId} 
                  onChange={e => setForm({...form, telegramChatId: e.target.value})} 
                  className="w-full max-w-md px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                  placeholder="e.g. 123456789"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleTestTelegram} 
                  disabled={testingTelegram || !form.telegramChatId}
                  className="shrink-0 text-xs font-semibold"
                >
                  {testingTelegram ? 'Sending Test...' : 'Send Test Notification'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-500" />
              TMDB Metadata Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                TMDB API Key (v3)
              </label>
              <p className="text-sm text-gray-500 mb-3">Required to fetch posters, ratings, overviews, cast, and genres from The Movie Database (TMDB).</p>
              <input 
                type="password" 
                value={form.metadataApiKey} 
                onChange={e => setForm({...form, metadataApiKey: e.target.value})} 
                className="w-full max-w-md px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j..."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-indigo-500" />
              Advanced Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between max-w-md bg-white border border-gray-200 p-4 rounded-xl">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Debug Logging Mode
                </label>
                <p className="text-sm text-gray-500">Store detailed scanner logs (parser results, matching info) in the Logs page.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.debugMode === 1}
                onClick={() => setForm({...form, debugMode: form.debugMode === 1 ? 0 : 1})}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${form.debugMode === 1 ? 'bg-indigo-600' : 'bg-gray-200'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.debugMode === 1 ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>Discard Changes</Button>
          <Button type="submit" isLoading={saving} className="gap-2">
            <Save className="w-4 h-4" /> Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
