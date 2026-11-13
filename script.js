(() => {
  "use strict";

  const STORAGE_KEY = "todo-list-tasks";
  const UNDO_TIMEOUT = 6000;
  const FILTER_DELAY = 300; // даём доиграть анимацию отметки, потом убираем строку из фильтра

  const $ = (id) => document.getElementById(id);
  const form = $("add-form");
  const input = $("task-input");
  const list = $("task-list");
  const empty = $("empty");
  const summary = $("summary");
  const progress = $("progress");
  const filters = $("filters");
  const clearBtn = $("clear-done");
  const toast = $("toast");
  const toastText = $("toast-text");
  const undoBtn = $("toast-undo");

  const EMPTY_TEXT = {
    all: "Список пуст. Добавьте первую задачу выше.",
    active: "Невыполненных задач нет.",
    done: "Выполненных задач пока нет.",
  };

  const CHECK_ICON =
    '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7"/></svg>';
  const REMOVE_ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>';

  let tasks = load();
  let filter = "all";
  let newId = null;
  let removed = [];
  let toastTimer = null;
  let listTimer = null;

  /* ---------- Хранилище ---------- */

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(data)) return [];
      return data
        .filter((t) => t && typeof t.text === "string")
        .map((t) => ({ id: String(t.id), text: t.text, done: Boolean(t.done) }));
    } catch (e) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      // Хранилище недоступно (например, приватный режим): работаем без сохранения.
    }
  }

  function uid() {
    if (window.crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  /* ---------- Действия ---------- */

  function addTask(text) {
    const task = { id: uid(), text, done: false };
    tasks.unshift(task);
    newId = task.id;
    save();
    render();
  }

  function setDone(li, done) {
    const task = tasks.find((t) => t.id === li.dataset.id);
    if (!task) return;
    task.done = done;
    li.classList.toggle("is-done", done);
    save();
    renderMeta();
    // Строку не пересоздаём, чтобы сработали CSS-переходы (галочка, зачёркивание).
    if (filter !== "all") {
      clearTimeout(listTimer);
      listTimer = setTimeout(renderList, FILTER_DELAY);
    }
  }

  function removeTask(id) {
    const index = tasks.findIndex((t) => t.id === id);
    if (index === -1) return;
    removed = [{ task: tasks[index], index }];
    tasks.splice(index, 1);
    save();
    render();
    showToast("Задача удалена");
  }

  function clearDone() {
    removed = tasks
      .map((task, index) => ({ task, index }))
      .filter((item) => item.task.done);
    if (removed.length === 0) return;
    tasks = tasks.filter((t) => !t.done);
    save();
    render();
    showToast(`Удалено задач: ${removed.length}`);
  }

  function undoRemove() {
    removed.forEach(({ task, index }) => {
      tasks.splice(Math.min(index, tasks.length), 0, task);
    });
    removed = [];
    hideToast();
    save();
    render();
  }

  /* ---------- Уведомление ---------- */

  function showToast(text) {
    toastText.textContent = text;
    toast.hidden = false;
    toast.classList.remove("in");
    void toast.offsetWidth; // перезапуск анимации
    toast.classList.add("in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      hideToast();
      removed = [];
    }, UNDO_TIMEOUT);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toast.hidden = true;
  }

  /* ---------- Отрисовка ---------- */

  function createRow(task) {
    const li = document.createElement("li");
    li.className =
      "task" + (task.done ? " is-done" : "") + (task.id === newId ? " is-new" : "");
    li.dataset.id = task.id;

    const label = document.createElement("label");
    label.className = "item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "item-input";
    checkbox.checked = task.done;

    const box = document.createElement("span");
    box.className = "box";
    box.innerHTML = CHECK_ICON;

    const text = document.createElement("span");
    text.className = "text";
    const line = document.createElement("span");
    line.className = "text-line";
    line.textContent = task.text;
    text.append(line);

    label.append(checkbox, box, text);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.setAttribute("aria-label", `Удалить задачу: ${task.text}`);
    remove.innerHTML = REMOVE_ICON;

    li.append(label, remove);
    return li;
  }

  function renderList() {
    // Запоминаем, что было в фокусе, чтобы клавиатурный пользователь не терял место.
    const active = document.activeElement;
    let focusId = null;
    let focusSelector = null;
    if (active && list.contains(active)) {
      focusId = active.closest("li").dataset.id;
      focusSelector = active.classList.contains("remove") ? ".remove" : ".item-input";
    }

    const visible = tasks.filter((t) => {
      if (filter === "active") return !t.done;
      if (filter === "done") return t.done;
      return true;
    });

    list.replaceChildren(...visible.map(createRow));
    newId = null;

    if (focusId) {
      const el = list.querySelector(
        `li[data-id="${CSS.escape(focusId)}"] ${focusSelector}`
      );
      if (el) el.focus();
    }

    empty.hidden = visible.length > 0;
    empty.textContent = EMPTY_TEXT[filter];
  }

  function renderMeta() {
    const total = tasks.length;
    const doneCount = tasks.filter((t) => t.done).length;

    filters.querySelector('[data-count="all"]').textContent = total;
    filters.querySelector('[data-count="active"]').textContent = total - doneCount;
    filters.querySelector('[data-count="done"]').textContent = doneCount;

    // Полоса прогресса: по одной секции на задачу
    while (progress.children.length < total) {
      progress.appendChild(document.createElement("span"));
    }
    while (progress.children.length > total) {
      progress.lastElementChild.remove();
    }
    Array.from(progress.children).forEach((seg, i) => {
      seg.classList.toggle("on", i < doneCount);
    });
    progress.setAttribute(
      "aria-valuenow",
      total ? Math.round((doneCount / total) * 100) : 0
    );

    if (total === 0) summary.textContent = "Список пуст";
    else if (doneCount === total) summary.textContent = "Всё выполнено";
    else summary.textContent = `Выполнено ${doneCount} из ${total}`;

    clearBtn.hidden = doneCount === 0;
  }

  function render() {
    renderList();
    renderMeta();
  }

  function renderDate() {
    const now = new Date();
    $("date-day").textContent = now.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
    });
    $("date-weekday").textContent = now.toLocaleDateString("ru-RU", {
      weekday: "long",
    });
  }

  /* ---------- События ---------- */

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.replace(/\s+/g, " ").trim();
    if (!text) {
      input.focus();
      return;
    }
    addTask(text);
    input.value = "";
    input.focus();
  });

  list.addEventListener("change", (e) => {
    if (e.target.classList.contains("item-input")) {
      setDone(e.target.closest("li"), e.target.checked);
    }
  });

  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove");
    if (btn) removeTask(btn.closest("li").dataset.id);
  });

  filters.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    filter = btn.dataset.filter;
    filters.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === btn));
    });
    clearTimeout(listTimer);
    renderList();
  });

  clearBtn.addEventListener("click", clearDone);
  undoBtn.addEventListener("click", undoRemove);

  renderDate();
  render();
})();
