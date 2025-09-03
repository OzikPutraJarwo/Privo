document.querySelectorAll('#experience .item').forEach(item => {
  item.addEventListener('click', function (event) {
    if (!event.target.classList.contains('desc')) {
      document.querySelectorAll('#experience .item').forEach(i => {
        // i.classList.remove('active');
      });
      item.classList.toggle('active');
    }
  });
  item.querySelector('.desc').addEventListener('click', function (event) {
    event.stopPropagation();
  });
});

document.querySelectorAll('a').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();

    const targetId = this.getAttribute('href');
    const targetElement = document.querySelector(targetId);
    const headerHeight = document.querySelector('header').offsetHeight;
    const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - headerHeight;

    window.scrollTo({
      top: targetPosition,
      behavior: 'smooth'
    });
  });
});

document.querySelector('.mobile-nav').addEventListener('click', () => {
  document.querySelector('header').classList.toggle('menu');
});

document.querySelector('.send-wa').addEventListener('click', function () {
  var nama = encodeURIComponent(document.querySelector('#contact-name').value);
  var pesan = encodeURIComponent(document.querySelector('#contact-msg').value);
  window.open('https://api.whatsapp.com/send?phone=6282124488900&text=Halo%20Wiaam!%20Saya%20' + nama + '.%0A%0A' + pesan);
});