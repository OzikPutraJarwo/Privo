// NAV MAIN TOGGGLE

document.querySelectorAll('nav [data-toggle]').forEach(el => {
  el.addEventListener('click', () => {
    const value = el.getAttribute('data-toggle');
    document.querySelectorAll('nav [data-toggle]').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.item-container').forEach(item => {
      item.classList.remove('active');
      if (item.id === value) item.classList.add('active');
    });
    document.querySelectorAll(`nav [data-toggle="${value}"]`).forEach(e => e.classList.add('active'));
  });
});

// OPEN POPUP

function openPopup(popupId) {
  document.querySelectorAll('.popup').forEach(p => p.classList.add('none'));
  document.querySelector(popupId).classList.remove('none');
}

// CLOSE POPUP

function closePopup() {
  document.querySelectorAll('.popup').forEach(p => p.classList.add('none'));
}

// FILE NAME INPUT

function getFileName() {
  const fileInput = document.getElementById('fileInput');
  const fileName = fileInput.files[0].name;
  document.querySelector('.library').classList.add('file-chosen');
  document.querySelector('.library .file-name').textContent = fileName;
}

// COUNTERS

function giveCounters(parentSelector, childSelector, noSelector) {
  const parents = document.querySelectorAll(parentSelector);
  let counter = 1;
  parents.forEach(parent => {
    const children = parent.querySelectorAll(childSelector);
    children.forEach(child => {
      const noElement = child.querySelector(noSelector);
      noElement.textContent = counter++ + `.`;
    });
  });
}

// NOTIFICATION

let timeout;

function notification(type, message) {
  const el = document.getElementById('notification');
  el.querySelector('span').innerHTML = message;
  el.className = '';
  el.classList.add(type);
  clearTimeout(timeout);
  el.classList.add('show');

  if (type === 'success') {
    el.querySelector('div').innerHTML = '<svg fill="white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"> <path fill-rule="evenodd" d="M12,2 C17.5228475,2 22,6.4771525 22,12 C22,17.5228475 17.5228475,22 12,22 C6.4771525,22 2,17.5228475 2,12 C2,6.4771525 6.4771525,2 12,2 Z M12,4 C7.581722,4 4,7.581722 4,12 C4,16.418278 7.581722,20 12,20 C16.418278,20 20,16.418278 20,12 C20,7.581722 16.418278,4 12,4 Z M15.2928932,8.29289322 L10,13.5857864 L8.70710678,12.2928932 C8.31658249,11.9023689 7.68341751,11.9023689 7.29289322,12.2928932 C6.90236893,12.6834175 6.90236893,13.3165825 7.29289322,13.7071068 L9.29289322,15.7071068 C9.68341751,16.0976311 10.3165825,16.0976311 10.7071068,15.7071068 L16.7071068,9.70710678 C17.0976311,9.31658249 17.0976311,8.68341751 16.7071068,8.29289322 C16.3165825,7.90236893 15.6834175,7.90236893 15.2928932,8.29289322 Z"/> </svg>';
  } else if (type === 'warning') {
    el.querySelector('div').innerHTML = '<svg fill="white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"> <path fill-rule="evenodd" d="M16,2 C16.2652165,2 16.5195704,2.10535684 16.7071068,2.29289322 L21.7071068,7.29289322 C21.8946432,7.4804296 22,7.73478351 22,8 L22,15 C22,15.2339365 21.9179838,15.4604694 21.7682213,15.6401844 L16.7682213,21.6401844 C16.5782275,21.868177 16.2967798,22 16,22 L8,22 C7.73478351,22 7.4804296,21.8946432 7.29289322,21.7071068 L2.29289322,16.7071068 C2.10535684,16.5195704 2,16.2652165 2,16 L2,8 C2,7.73478351 2.10535684,7.4804296 2.29289322,7.29289322 L7.29289322,2.29289322 C7.4804296,2.10535684 7.73478351,2 8,2 L16,2 Z M15.5857864,4 L8.41421356,4 L4,8.41421356 L4,15.5857864 L8.41421356,20 L15.5316251,20 L20,14.6379501 L20,8.41421356 L15.5857864,4 Z M12,16 C12.5522847,16 13,16.4477153 13,17 C13,17.5522847 12.5522847,18 12,18 C11.4477153,18 11,17.5522847 11,17 C11,16.4477153 11.4477153,16 12,16 Z M12,6 C12.5522847,6 13,6.44771525 13,7 L13,13 C13,13.5522847 12.5522847,14 12,14 C11.4477153,14 11,13.5522847 11,13 L11,7 C11,6.44771525 11.4477153,6 12,6 Z"/> </svg>';
  } else if (type === 'error') {
    el.querySelector('div').innerHTML = '<svg fill="white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"> <path fill-rule="evenodd" d="M12,2 C17.5228475,2 22,6.4771525 22,12 C22,17.5228475 17.5228475,22 12,22 C6.4771525,22 2,17.5228475 2,12 C2,6.4771525 6.4771525,2 12,2 Z M12,4 C7.581722,4 4,7.581722 4,12 C4,16.418278 7.581722,20 12,20 C16.418278,20 20,16.418278 20,12 C20,7.581722 16.418278,4 12,4 Z M7.29325,7.29325 C7.65417308,6.93232692 8.22044527,6.90456361 8.61296051,7.20996006 L8.70725,7.29325 L12.00025,10.58625 L15.29325,7.29325 C15.68425,6.90225 16.31625,6.90225 16.70725,7.29325 C17.0681731,7.65417308 17.0959364,8.22044527 16.7905399,8.61296051 L16.70725,8.70725 L13.41425,12.00025 L16.70725,15.29325 C17.09825,15.68425 17.09825,16.31625 16.70725,16.70725 C16.51225,16.90225 16.25625,17.00025 16.00025,17.00025 C15.7869167,17.00025 15.5735833,16.9321944 15.3955509,16.796662 L15.29325,16.70725 L12.00025,13.41425 L8.70725,16.70725 C8.51225,16.90225 8.25625,17.00025 8.00025,17.00025 C7.74425,17.00025 7.48825,16.90225 7.29325,16.70725 C6.93232692,16.3463269 6.90456361,15.7800547 7.20996006,15.3875395 L7.29325,15.29325 L10.58625,12.00025 L7.29325,8.70725 C6.90225,8.31625 6.90225,7.68425 7.29325,7.29325 Z"/> </svg>';
  } else if (type === 'info') {
    el.querySelector('div').innerHTML = '<svg fill="white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"> <path fill-rule="evenodd" d="M12,2 C17.5228475,2 22,6.4771525 22,12 C22,17.5228475 17.5228475,22 12,22 C6.4771525,22 2,17.5228475 2,12 C2,6.4771525 6.4771525,2 12,2 Z M12,4 C7.581722,4 4,7.581722 4,12 C4,16.418278 7.581722,20 12,20 C16.418278,20 20,16.418278 20,12 C20,7.581722 16.418278,4 12,4 Z M12,16 C12.5522847,16 13,16.4477153 13,17 C13,17.5522847 12.5522847,18 12,18 C11.4477153,18 11,17.5522847 11,17 C11,16.4477153 11.4477153,16 12,16 Z M12,6 C12.5522847,6 13,6.44771525 13,7 L13,13 C13,13.5522847 12.5522847,14 12,14 C11.4477153,14 11,13.5522847 11,13 L11,7 C11,6.44771525 11.4477153,6 12,6 Z"/> </svg>';
  } else if (type === 'loading') {
    el.querySelector('div').innerHTML = '<svg style="animation-name: spin; animation-duration: 2000ms; animation-iteration-count: infinite; animation-timing-function: linear;" fill="white" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 26.349 26.35" xml:space="preserve"> <g> <g> <circle cx="13.792" cy="3.082" r="3.082"/> <circle cx="13.792" cy="24.501" r="1.849"/> <circle cx="6.219" cy="6.218" r="2.774"/> <circle cx="21.365" cy="21.363" r="1.541"/> <circle cx="3.082" cy="13.792" r="2.465"/> <circle cx="24.501" cy="13.791" r="1.232"/> <path d="M4.694,19.84c-0.843,0.843-0.843,2.207,0,3.05c0.842,0.843,2.208,0.843,3.05,0c0.843-0.843,0.843-2.207,0-3.05 C6.902,18.996,5.537,18.988,4.694,19.84z"/> <circle cx="21.364" cy="6.218" r="0.924"/> </g> </g> </svg>';
  }

  if (type !== 'loading') {
    timeout = setTimeout(() => el.classList.remove('show'), 4000);
  }
}

// PROGRESS COLOR

(function () {
  const colors = [
    [244, 67, 54],
    [255, 111, 0],
    [255, 179, 0],
    [104, 159, 56],
    [56, 142, 60]
  ];

  function applyColors() {
    function getColor(value) {
      value = Math.max(0, Math.min(100, value));
      const step = 100 / (colors.length - 1);
      const idx = Math.floor(value / step);
      const t = (value % step) / step;
      if (idx >= colors.length - 1) return `rgb(${colors[colors.length - 1].join(",")})`;
      const c1 = colors[idx];
      const c2 = colors[idx + 1];
      return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * t)},${Math.round(c1[1] + (c2[1] - c1[1]) * t)},${Math.round(c1[2] + (c2[2] - c1[2]) * t)})`;
    }

    function updateColors() {
      document.querySelectorAll('.progress span').forEach(span => {
        span.style.backgroundColor = getColor(parseInt(span.textContent.trim()));
      });
    }

    const observer = new MutationObserver(updateColors);
    document.querySelectorAll('.progress span').forEach(span => observer.observe(span, { childList: true }));
    updateColors();
  }

  applyColors();
})();

// PROGRESS AVERAGE

const setupProgressUpdater = () => {
    const valueContainers = Array.from(document.querySelectorAll('[data-progress-value]'));
    const targetContainers = Array.from(document.querySelectorAll('[data-progress][data-progress-type]'));

    const updateProgress = () => {
        const valuesMap = {};
        valueContainers.forEach(el => {
            const type = el.dataset.progressValue;
            const val = parseFloat(el.querySelector('span').textContent) || 0;
            if (!valuesMap[type]) valuesMap[type] = [];
            valuesMap[type].push(val);
        });

        targetContainers.forEach(target => {
            const type = target.dataset.progress;
            const calcType = target.dataset.progressType;
            const span = target.querySelector('span');
            const values = valuesMap[type] || [];
            let result = 0;

            if (calcType === 'average') {
                result = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(0) : 0;
            } else if (calcType === 'sum') {
                result = values.length ? values.reduce((a, b) => a + b, 0) : 0;
            }

            span.textContent = result;
        });
    };

    const observer = new MutationObserver(updateProgress);
    const config = { childList: true, subtree: true };
    valueContainers.forEach(el => observer.observe(el, config));
    updateProgress();
};

setupProgressUpdater();
