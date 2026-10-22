import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { clearTokens } from '../utils/auth';
import { Mic, MessageCircle, Monitor, User, Download, Trash2, AlertTriangle, Check, X } from 'lucide-react';

const TABS = [
    { id: 'transcription', label: 'Transcription', icon: Mic },
    { id: 'ai', label: 'AI Chat', icon: MessageCircle },
    { id: 'display', label: 'Display', icon: Monitor },
    { id: 'account', label: 'Account', icon: User },
];

const LANGUAGES = [
    { code: '', label: 'Auto-detect' },
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'French' },
    { code: 'es', label: 'Spanish' },
    { code: 'de', label: 'German' },
    { code: 'it', label: 'Italian' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'nl', label: 'Dutch' },
    { code: 'ja', label: 'Japanese' },
    { code: 'zh', label: 'Chinese' },
    { code: 'ko', label: 'Korean' },
    { code: 'ar', label: 'Arabic' },
    { code: 'ru', label: 'Russian' },
];

// A drop-down of ready-made prompts (from the API) with a "Custom" choice that shows a text box.
// '' is the default: MemoMind's own rules, or no automatic question.
const PromptSelect = ({ label, description, presets, value, onChange, placeholder, rows, selectClass, inputClass, labelClass, descClass }) => {
    const [custom, setCustom] = useState(false);
    const current = presets.find((p) => p.text.trim() === value.trim());
    const isCustom = custom || (value.trim() !== '' && !current);
    const selected = isCustom ? '__custom__' : (current ? current.id : presets[0]?.id ?? '');

    const choose = (id) => {
        if (id === '__custom__') {
            setCustom(true); // start from the current text, to tweak it
            return;
        }
        setCustom(false);
        onChange(presets.find((p) => p.id === id).text);
    };

    return (
        <div>
            <label className={labelClass}>{label}</label>
            <p className={descClass + ' mb-2'}>{description}</p>
            <select value={selected} onChange={(e) => choose(e.target.value)} className={selectClass}>
                {presets.map((p) => (
                    <option key={p.id} value={p.id}>{p.label.en}</option>
                ))}
                <option value="__custom__">Custom…</option>
            </select>
            {!isCustom && current && <p className={descClass + ' mt-1'}>{current.hint.en}</p>}
            {isCustom && (
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`${inputClass} ${rows} font-mono text-sm mt-2`}
                    placeholder={placeholder}
                />
            )}
        </div>
    );
};

const SettingsModal = ({ isOpen, onClose, onSettingsChange }) => {
    const [activeTab, setActiveTab] = useState('transcription');
    const [presets, setPresets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    
    // Settings state
    const [settings, setSettings] = useState({
        // AI Chat
        system_prompt_template: '',
        default_user_prompt: '',
        response_length: 'medium',
        // Transcription
        default_quality: 'medium',
        default_language: '',
        auto_summary: true,
        // Display
        theme: 'system',
        date_format: 'us',
        font_size: 'medium',
    });
    
    // Account state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [userEmail, setUserEmail] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchSettings();
            fetchUserEmail();
            api.get('/prompt-presets').then((r) => setPresets(r.data)).catch(() => {});
        }
    }, [isOpen]);

    const fetchSettings = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/settings');
            setSettings({
                system_prompt_template: response.data.system_prompt_template || '',
                default_user_prompt: response.data.default_user_prompt || '',
                response_length: response.data.response_length || 'medium',
                default_quality: response.data.default_quality || 'medium',
                default_language: response.data.default_language || '',
                auto_summary: response.data.auto_summary !== false,
                theme: response.data.theme || 'system',
                date_format: response.data.date_format || 'us',
                font_size: response.data.font_size || 'medium',
            });
        } catch (err) {
            console.error('Failed to fetch settings:', err);
            setError('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const fetchUserEmail = async () => {
        try {
            const response = await api.get('/me');
            setUserEmail(response.data.email);
        } catch (err) {
            console.error('Failed to fetch user email:', err);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await api.put('/settings', settings);
            setSuccess('Settings saved successfully');
            if (onSettingsChange) {
                onSettingsChange(settings);
            }
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            console.error('Failed to save settings:', err);
            setError('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleExportData = async () => {
        try {
            const response = await api.get('/account/export', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `voice_transcript_export_${new Date().toISOString().split('T')[0]}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setSuccess('Data exported successfully');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError('Failed to export data');
        }
    };

    const handleDeleteAccount = async () => {
        try {
            await api.delete('/account');
            clearTokens();
            window.location.reload();
        } catch (err) {
            setError('Failed to delete account');
        }
    };

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    if (!isOpen) return null;

    const inputClass = "w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent";
    const selectClass = "w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent";
    const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";
    const descClass = "text-xs text-gray-500 dark:text-gray-400 mt-1";

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2>
                    <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-2xl">
                        ×
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.id
                                    ? 'border-primary-600 text-primary-600'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Messages */}
                {error && (
                    <div className="mx-6 mt-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg flex items-center gap-2">
                        <X className="w-4 h-4" />
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mx-6 mt-4 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        {success}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                        </div>
                    ) : (
                        <>
                            {/* Transcription Tab */}
                            {activeTab === 'transcription' && (
                                <div className="space-y-6">
                                    <div>
                                        <label className={labelClass}>Default Quality</label>
                                        <div className="flex gap-2 mt-2">
                                            {['low', 'medium', 'high'].map(q => (
                                                <button
                                                    key={q}
                                                    onClick={() => updateSetting('default_quality', q)}
                                                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                                                        settings.default_quality === q
                                                            ? 'bg-primary-600 text-white'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                                >
                                                    {q.charAt(0).toUpperCase() + q.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                        <p className={descClass}>
                                            {settings.default_quality === 'high' && '128k bitrate - Best quality'}
                                            {settings.default_quality === 'medium' && '96k bitrate - Balanced'}
                                            {settings.default_quality === 'low' && '64k bitrate - Smaller file size'}
                                        </p>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Default Language</label>
                                        <select
                                            value={settings.default_language}
                                            onChange={(e) => updateSetting('default_language', e.target.value)}
                                            className={selectClass}
                                        >
                                            {LANGUAGES.map(lang => (
                                                <option key={lang.code} value={lang.code}>{lang.label}</option>
                                            ))}
                                        </select>
                                        <p className={descClass}>Force a specific language or let the AI auto-detect</p>
                                    </div>

                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={settings.auto_summary}
                                            onChange={(e) => updateSetting('auto_summary', e.target.checked)}
                                            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                        />
                                        <span>
                                            <span className={labelClass}>Automatic title and summary</span>
                                            <span className={descClass}>After each transcription, the AI names the entry and writes a short summary.</span>
                                        </span>
                                    </label>
                                </div>
                            )}

                            {/* AI Chat Tab */}
                            {activeTab === 'ai' && (
                                <div className="space-y-6">
                                    <div>
                                        <label className={labelClass}>Response Length</label>
                                        <div className="flex gap-2 mt-2">
                                            {['short', 'medium', 'detailed'].map(len => (
                                                <button
                                                    key={len}
                                                    onClick={() => updateSetting('response_length', len)}
                                                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                                                        settings.response_length === len
                                                            ? 'bg-primary-600 text-white'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                                >
                                                    {len.charAt(0).toUpperCase() + len.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <PromptSelect
                                        label="Assistant style"
                                        description="How the AI answers in a transcript's chat."
                                        presets={presets.filter((p) => p.kind === 'system')}
                                        value={settings.system_prompt_template}
                                        onChange={(v) => updateSetting('system_prompt_template', v)}
                                        placeholder="You are a helpful assistant... Use {transcript} where the transcript goes (otherwise it is added at the end)."
                                        rows="h-32"
                                        selectClass={inputClass}
                                        inputClass={inputClass}
                                        labelClass={labelClass}
                                        descClass={descClass}
                                    />

                                    <PromptSelect
                                        label="Automatic question"
                                        description="Asked by itself when you open the chat of a new transcript."
                                        presets={presets.filter((p) => p.kind === 'auto')}
                                        value={settings.default_user_prompt}
                                        onChange={(v) => updateSetting('default_user_prompt', v)}
                                        placeholder="Summarize the main points..."
                                        rows="h-24"
                                        selectClass={inputClass}
                                        inputClass={inputClass}
                                        labelClass={labelClass}
                                        descClass={descClass}
                                    />
                                </div>
                            )}

                            {/* Display Tab */}
                            {activeTab === 'display' && (
                                <div className="space-y-6">
                                    <div>
                                        <label className={labelClass}>Theme</label>
                                        <div className="flex gap-2 mt-2">
                                            {['light', 'dark', 'system'].map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => updateSetting('theme', t)}
                                                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                                                        settings.theme === t
                                                            ? 'bg-primary-600 text-white'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                                >
                                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Date Format</label>
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => updateSetting('date_format', 'us')}
                                                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                                                    settings.date_format === 'us'
                                                        ? 'bg-primary-600 text-white'
                                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                }`}
                                            >
                                                US (MM/DD/YYYY)
                                            </button>
                                            <button
                                                onClick={() => updateSetting('date_format', 'eu')}
                                                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                                                    settings.date_format === 'eu'
                                                        ? 'bg-primary-600 text-white'
                                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                }`}
                                            >
                                                EU (DD/MM/YYYY)
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Transcript Font Size</label>
                                        <div className="flex gap-2 mt-2">
                                            {['small', 'medium', 'large'].map(size => (
                                                <button
                                                    key={size}
                                                    onClick={() => updateSetting('font_size', size)}
                                                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                                                        settings.font_size === size
                                                            ? 'bg-primary-600 text-white'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                                >
                                                    {size.charAt(0).toUpperCase() + size.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Account Tab */}
                            {activeTab === 'account' && (
                                <div className="space-y-8">
                                    {/* Signed in as */}
                                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Current Email</p>
                                        <p className="font-medium text-gray-900 dark:text-white">{userEmail}</p>
                                    </div>

                                    {/* Export Data */}
                                    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Export Data</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                            Download all your transcripts as a ZIP file
                                        </p>
                                        <button
                                            onClick={handleExportData}
                                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                                        >
                                            <Download className="w-4 h-4" />
                                            Export All Data
                                        </button>
                                    </div>

                                    {/* Delete Account */}
                                    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                                        <h3 className="text-lg font-medium text-red-600 dark:text-red-400 mb-2">Danger Zone</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                            Permanently delete your account and all data. This cannot be undone.
                                        </p>
                                        {!showDeleteConfirm ? (
                                            <button
                                                onClick={() => setShowDeleteConfirm(true)}
                                                className="flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Delete Account
                                            </button>
                                        ) : (
                                            <div className="p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800">
                                                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-3">
                                                    <AlertTriangle className="w-5 h-5" />
                                                    <span className="font-medium">Are you absolutely sure?</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setShowDeleteConfirm(false)}
                                                        className="flex-1 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={handleDeleteAccount}
                                                        className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                                                    >
                                                        Yes, Delete Everything
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {activeTab !== 'account' && (
                    <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading || saving}
                            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SettingsModal;
