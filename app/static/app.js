const tg = window.Telegram.WebApp;
tg.expand();

const initData = tg.initData || "";
const byId = (id) => document.getElementById(id);

async function api(path, method = "GET", body = null, useQueryInit = false) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  let url = path;
  if (body) opts.body = JSON.stringify(body);
  if (useQueryInit) url += `?initData=${encodeURIComponent(initData)}`;
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error((await res.json()).detail || "Ошибка");
  return res.json();
}

function adCard(ad, withEdit = false) {
  const div = document.createElement("div");
  div.className = "ad-item";
  div.innerHTML = `
    <b>#${ad.id} ${ad.title}</b><br/>
    ${ad.description}<br/>
    ${ad.price} ${ad.currency} | ${ad.country} | ${ad.ad_type}
  `;

  if (!withEdit) {
    const actions = document.createElement("div");
    actions.className = "inline";
    const ok = document.createElement("button");
    ok.textContent = "✅ Одобрить";
    ok.onclick = async () => {
      await api("/api/moderation/approve", "POST", { initData, ad_id: ad.id });
      tg.showAlert("Объявление одобрено");
      loadModeration();
    };
    const reject = document.createElement("button");
    reject.textContent = "❌ Отклонить";
    reject.onclick = async () => {
      const reason = prompt("Причина отклонения:", "Нарушение правил") || "Без причины";
      await api("/api/moderation/reject", "POST", { initData, ad_id: ad.id, reason });
      tg.showAlert("Объявление отклонено");
      loadModeration();
    };
    actions.append(ok, reject);
    div.append(actions);
    return div;
  }

  const t = document.createElement("input"); t.value = ad.title;
  const d = document.createElement("input"); d.value = ad.description;
  const p = document.createElement("input"); p.value = ad.price;
  const save = document.createElement("button");
  save.textContent = "💾 Сохранить";
  save.onclick = async () => {
    await api("/api/moderation/edit", "POST", { initData, ad_id: ad.id, title: t.value, description: d.value, price: p.value });
    tg.showAlert("Изменено");
  };
  const del = document.createElement("button");
  del.textContent = "🗑 Удалить";
  del.onclick = async () => {
    await api("/api/moderation/delete", "POST", { initData, ad_id: ad.id });
    tg.showAlert("Удалено");
    loadPublished();
  };
  div.append(t,d,p,save,del);
  return div;
}

async function loadModeration() {
  try {
    const list = await api("/api/moderation/pending", "GET", null, true);
    byId("mod_panel").classList.remove("hidden");
    const root = byId("pending_list");
    root.innerHTML = "";
    if (!list.length) root.innerHTML = "<i>Нет заявок</i>";
    list.forEach((ad) => root.append(adCard(ad)));
  } catch {}
}

async function loadPublished() {
  try {
    const list = await api("/api/moderation/published", "GET", null, true);
    const root = byId("published");
    root.innerHTML = "";
    list.forEach((ad) => root.append(adCard(ad, true)));
  } catch {}
}

async function loadMods() {
  const list = await api("/api/moderators", "GET", null, true);
  const root = byId("mods");
  root.innerHTML = "";
  list.forEach((m) => {
    const li = document.createElement("li");
    li.textContent = `${m.telegram_id} @${m.username || "unknown"} (${m.role})`;
    if (m.role !== "chief") {
      const btn = document.createElement("button");
      btn.textContent = "Удалить";
      btn.onclick = async () => {
        await api("/api/moderators/remove", "POST", { initData, target_id: m.telegram_id });
        loadMods();
      };
      li.append(btn);
    }
    root.append(li);
  });
}

async function bootstrap() {
  const data = await api("/api/bootstrap", "POST", { initData });
  byId("hello").textContent = `Привет, ${data.user.first_name || data.user.username || "пользователь"}!`;

  const country = byId("country");
  Object.entries(data.countries).forEach(([name, cur]) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${name} (${cur})`;
    country.append(option);
  });

  byId("avatar").src = `/api/avatar/${data.user.id}`;
  byId("profile_stats").textContent = `Опубликовано объявлений: ${data.profile.total_ads}`;
  const adsUl = byId("profile_ads");
  data.profile.ads.forEach((ad) => {
    const li = document.createElement("li");
    li.innerHTML = `${ad.title} ${ad.link ? `<a href='${ad.link}' target='_blank'>ссылка</a>` : ""}`;
    adsUl.append(li);
  });

  byId("submit").onclick = async () => {
    await api("/api/ad", "POST", {
      initData,
      ad_type: byId("ad_type").value,
      country: byId("country").value,
      title: byId("title").value,
      description: byId("description").value,
      price: byId("price").value,
      photo_file_id: byId("photo_file_id").value || null,
    });
    tg.showAlert("Отправлено на модерацию");
  };

  if (["moderator", "chief"].includes(data.user.role)) await loadModeration();
  if (data.user.role === "chief") {
    byId("chief_panel").classList.remove("hidden");
    byId("add_mod").onclick = async () => {
      await api("/api/moderators/add", "POST", { initData, target_id: byId("mod_id").value });
      tg.showAlert("Добавлен");
      loadMods();
    };
    byId("list_mods").onclick = loadMods;
    await loadMods();
    await loadPublished();
  }
}

bootstrap().catch((e) => tg.showAlert(e.message));
