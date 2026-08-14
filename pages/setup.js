import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Setup() {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const bookmarklet = `javascript:(function(){location.href='${origin}/check?url='+encodeURIComponent(location.href)})();`;
  const shortcutUrl = `${origin}/check#u=`;

  const copy = async (text, key) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      <Head>
        <title>ワンクリック設定 | 買取価格チェック</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 pb-16">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">📱 ワンクリック設定</h1>
            <Link href="/check" className="text-sm text-indigo-600 underline">
              手動で調べる
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4 text-sm text-gray-600">
            iPhoneで商品ページを見ているときに、ワンタップで各買取店の買取価格を調べられるようにします。
            方法は2つ、どちらか片方でOKです。
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4 space-y-3">
            <h2 className="font-bold text-gray-800">方法A: 共有シートに追加（おすすめ）</h2>
            <p className="text-sm text-gray-600">
              Safariの共有ボタンから直接呼び出せます。設定は1回だけです。
            </p>
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>「ショートカット」アプリを開き、右上の「+」で新規ショートカットを作成</li>
              <li>
                アクションを追加 →「<b>URLを開く</b>」を選ぶ
              </li>
              <li>
                URL欄に下のアドレスを貼り付け、続けて変数「<b>ショートカット入力</b>」を挿入
                <div className="mt-2 bg-gray-50 rounded-lg p-3 break-all font-mono text-xs">
                  {shortcutUrl}
                  <span className="text-indigo-600">［ショートカット入力］</span>
                </div>
                <button
                  onClick={() => copy(shortcutUrl, 'shortcut')}
                  className="mt-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm"
                >
                  {copied === 'shortcut' ? 'コピーしました' : 'アドレスをコピー'}
                </button>
              </li>
              <li>
                ショートカットの詳細（ⓘ）を開き、「<b>共有シートに表示</b>」をオン。受け取る種類は
                「URL」と「テキスト」にする
              </li>
              <li>
                名前を「買取価格を調べる」などにして保存
              </li>
            </ol>
            <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-900">
              使い方: 商品ページで <b>共有ボタン → 買取価格を調べる</b> をタップするだけ。
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4 space-y-3">
            <h2 className="font-bold text-gray-800">方法B: ブックマークレット</h2>
            <p className="text-sm text-gray-600">
              Safariのブックマークから呼び出す方法です。ショートカットを使いたくない場合はこちら。
            </p>
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>下のボタンでコードをコピー</li>
              <li>Safariでこのページをブックマークに追加（共有ボタン →「ブックマークを追加」）</li>
              <li>
                ブックマーク一覧 → 「編集」→ 追加したブックマークを開き、名前を「買取価格」に、
                アドレス欄を <b>コピーしたコードで上書き</b>
              </li>
            </ol>
            <div className="bg-gray-50 rounded-lg p-3 break-all font-mono text-xs text-gray-600">
              {bookmarklet}
            </div>
            <button
              onClick={() => copy(bookmarklet, 'bookmarklet')}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm"
            >
              {copied === 'bookmarklet' ? 'コピーしました' : 'コードをコピー'}
            </button>
            <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-900">
              使い方: 商品ページで <b>アドレスバー → ブックマーク → 買取価格</b> をタップ。
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4 space-y-2">
            <h2 className="font-bold text-gray-800">ホーム画面に追加しておくと便利</h2>
            <p className="text-sm text-gray-600">
              Safariで共有ボタン →「ホーム画面に追加」で、アプリのように起動できます。
            </p>
          </div>

          <div className="text-xs text-gray-400 text-center">
            価格はWeb検索で見つけた掲載値です。実際の査定額は状態・時期によって変わります。
          </div>
        </div>
      </div>
    </>
  );
}
