(() => {
  const SONGS = [
    ['Folded in Halves','listen/audio/track-01.mp3'],['가을 화분','listen/audio/track-02.mp3'],['두 접시 나란히 두자','listen/audio/track-03.mp3'],
    ['가을 화분 ver 2','listen/audio/track-04.mp3'],['Folded in Halves ver 2','listen/audio/track-05.mp3'],['끓지 않는 국물','listen/audio/track-06.mp3'],['하얀 봉투','listen/audio/track-07.mp3']
  ];
  const au = new Audio(); au.preload = 'none'; au.volume = .6;
  const pt = document.getElementById('pt'), pp = document.getElementById('pp'), pn = document.getElementById('pn');
  let i = 0, want = true, started = false;
  const set = k => { i = (k + SONGS.length) % SONGS.length; au.src = SONGS[i][1]; pt.textContent = '♪ ' + SONGS[i][0]; };
  const play = () => au.play().then(() => started = true).catch(() => {});
  au.addEventListener('ended', () => { set(i + 1); play(); });
  au.addEventListener('play', () => pp.textContent = 'STOP 停止');
  au.addEventListener('pause', () => pp.textContent = 'PLAY 再生');
  pp.addEventListener('click', e => { e.stopPropagation(); if (au.paused) { want = true; play(); } else { want = false; au.pause(); } });
  pn.addEventListener('click', e => { e.stopPropagation(); set(i + 1); want = true; play(); });
  set(0); play();
  const kick = () => { if (!started && want) play(); };
  ['pointerdown', 'keydown', 'touchend'].forEach(ev => addEventListener(ev, kick, { passive: true }));
})();
