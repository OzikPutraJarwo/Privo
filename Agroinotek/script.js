function transformSiteName() {
  const siteNameDiv = document.querySelector('.pkp_site_name');
  const link = siteNameDiv.querySelector('a');
  const img = link.querySelector('img');
  
  const newDiv = document.createElement('div');
  newDiv.appendChild(img.cloneNode());

  const textDiv = document.createElement('div');
  const titleSpan = document.createElement('span');
  titleSpan.textContent = 'AGROINOTEK';
  const subtitleSpan = document.createElement('span');
  subtitleSpan.textContent = 'Jurnal Penelitian dan Pengabdian Masyarakat';
  textDiv.appendChild(titleSpan);
  textDiv.appendChild(subtitleSpan);

  link.innerHTML = '';
  link.appendChild(newDiv);
  link.appendChild(textDiv);
}

transformSiteName();