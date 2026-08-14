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
        <title>使い方 | 買取利益チェック</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 pb-16">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">📱 使い方</h1>
            <Link href="/check" className="text-sm text-indigo-600 underline">
              調べる画面へ
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4 text-sm text-gray-600 space-y-1">
            <p>通販サイトの商品ページで、「これ買って買取に出したら儲かるか」をすぐ確認できます。</p>
            <p>用途によって2つのやり方があります。</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4 space-y-3">
            <h2 className="font-bold text-gray-800">方法A: スクリーンショットで調べる（おすすめ）</h2>
            <p className="text-sm text-gray-600">
              価格・ポイント表示ごとスクショを撮って選ぶだけ。通販サイトはページを直接読み取れないことが多いため、こちらが一番正確です。
            </p>
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>商品ページで、価格とポイント還元がわかる部分のスクリーンショットを撮る</li>
              <li>このアプリをホーム画面に追加しておく（下記参照）と、アイコンをタップしてすぐ開ける</li>
              <li>
                「調べる画面へ」→ <b>スクリーンショットを選択</b> → 撮った画像を選ぶ
              </li>
              <li>状態を選んで「この画像で調べる」</li>
            </ol>
            <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-900">
              購入価格・買取価格・ポイント差引後の利益が、その場で緑（買い）／赤（損）で表示されます。
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4 space-y-3">
            <h2 className="font-bold text-gray-800">方法B: URLを共有して調べる</h2>
            <p className="text-sm text-gray-600">
              スクショを撮らずページのURLだけ渡す方法です。サイトによっては価格やポイントを正しく読み取れないことがあります。
            </p>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">B-1. 共有シートに追加（ショートカットApp）</p>
              <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                <li>「ショートカット」アプリ → 右上の「+」で新規ショートカットを作成</li>
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
                  ショートカットの詳細（ⓘ）を開き、「<b>共有シートに表示</b>」をオン。受け取る種類は「URL」と「テキスト」にする
                </li>
                <li>名前を「買取利益を調べる」などにして保存</li>
              </ol>
              <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-900">
                使い方: 商品ページで <b>共有ボタン → 買取利益を調べる</b>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium text-gray-700">B-2. ブックマークレット</p>
              <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                <li>下のボタンでコードをコピー</li>
                <li>Safariでこのページをブックマークに追加</li>
                <li>ブックマーク一覧 → 「編集」→ 名前を「買取利益」に、アドレス欄をコピーしたコードで上書き</li>
              </ol>
              <div className="bg-gray-50 rounded-lg p-3 break-all font-mono text-xs text-gray-600">{bookmarklet}</div>
              <button
                onClick={() => copy(bookmarklet, 'bookmarklet')}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm"
              >
                {copied === 'bookmarklet' ? 'コピーしました' : 'コードをコピー'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4 space-y-2">
            <h2 className="font-bold text-gray-800">ホーム画面に追加しておくと便利</h2>
            <p className="text-sm text-gray-600">
              Safariで共有ボタン →「ホーム画面に追加」で、アプリのように起動できます。スクリーンショット方式を使うならこれが一番速い入口です。
            </p>
          </div>

          <div className="text-xs text-gray-400 text-center">
            価格はWeb検索・画像認識で見つけた掲載値です。実際の査定額・ポイント条件は状態や時期によって変わります。
          </div>
        </div>
      </div>
    </>
  );
}
