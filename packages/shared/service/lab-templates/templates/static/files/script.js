const button = document.querySelector('#counter');
let count = 0;

button.addEventListener('click', () => {
   count += 1;
   button.textContent = '点击次数：' + count;
   console.log('clicked', count);
});
