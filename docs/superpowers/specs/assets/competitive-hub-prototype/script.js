(() => {
  const seasonTarget = new Date(Date.now() + ((12 * 24 + 14) * 60 + 22) * 60 * 1000);
  let dailyRemaining = 3 * 3600 + 16 * 60 + 52;

  const seasonEl = document.querySelector('#seasonCountdown');
  const dailyEl = document.querySelector('#dailyCountdown');
  const footerEl = document.querySelector('#footerCountdown');
  const toast = document.querySelector('#toast');

  const pad = value => String(value).padStart(2, '0');

  function updateSeason() {
    const diff = Math.max(0, seasonTarget.getTime() - Date.now());
    const totalMinutes = Math.floor(diff / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    seasonEl.textContent = `${days}д ${hours}ч ${minutes}м`;
  }

  function updateDaily() {
    dailyRemaining = Math.max(0, dailyRemaining - 1);
    if (dailyRemaining === 0) dailyRemaining = 24 * 3600;
    const hours = Math.floor(dailyRemaining / 3600);
    const minutes = Math.floor((dailyRemaining % 3600) / 60);
    const seconds = dailyRemaining % 60;
    const value = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    dailyEl.textContent = value;
    footerEl.textContent = value;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2200);
  }

  document.querySelector('[data-action="login"]').addEventListener('click', () => {
    showToast('Вход в профиль выполнен');
    document.querySelector('#profile').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.querySelector('[data-action="play"]').addEventListener('click', event => {
    event.currentTarget.querySelector('b').textContent = 'Подключаем…';
    showToast('Подключение к сегодняшнему раунду…');
    window.setTimeout(() => {
      event.currentTarget.querySelector('b').textContent = 'Играть сегодня';
    }, 1700);
  });

  document.querySelector('.panel-heading a').addEventListener('click', event => {
    event.preventDefault();
    const row = document.querySelector('#currentPlayer');
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Твоя позиция: #14');
  });

  updateSeason();
  dailyRemaining += 1;
  updateDaily();
  window.setInterval(updateSeason, 30000);
  window.setInterval(updateDaily, 1000);
})();
