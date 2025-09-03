const fs = require('fs');

// Nama file yang akan diproses
const htmlFilePath = 'index.html';
const phpFilePath = 'index.php';

// Langkah 1: Buat index.php
const phpHeader = `<?php
/*
Template Name: Custom CV
*/

$path = "/wp-content/themes/blossom-mommy-blog/kodejarwo/";
?>
`;

// Langkah 2: Tempatkan kode di dalam index.php
fs.writeFileSync(phpFilePath, phpHeader);

// Langkah 3: Ambil semua isi index.html
const htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');

// Langkah 4 dan 5: Ubah src/href untuk tag img, link, dan script
const modifiedContent = htmlContent
    .replace(/<img[^>]+src="(?!http)([^"]+)"[^>]*>/g, (match, p1) => {
        return match.replace(`src="${p1}"`, `src="<?php echo $path; ?>${p1}"`);
    })
    .replace(/<link[^>]+href="(?!http)([^"]+)"[^>]*>/g, (match, p1) => {
        return match.replace(`href="${p1}"`, `href="<?php echo $path; ?>${p1}"`);
    })
    .replace(/<script[^>]+src="(?!http)([^"]+)"[^>]*><\/script>/g, (match, p1) => {
        return match.replace(`src="${p1}"`, `src="<?php echo $path; ?>${p1}"`);
    });

// Gabungkan isi yang sudah dimodifikasi dengan kode PHP yang sudah ada
const finalContent = phpHeader + modifiedContent;

// Simpan hasil ke index.php
fs.writeFileSync(phpFilePath, finalContent);

console.log('index.php telah dibuat dan diupdate!');