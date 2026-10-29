/* Курс: общие конструкторы заданий. Файлы u1.js … u10.js вызывают COURSE_ADD(({G,P,F,O,T}) => [ …уроки… ]). */
window.COURSE = [];
window.COURSE_ADD = (build, book) => {
  /* G — вписать слово/форму в пропуск ___ ; P — выбрать (первый вариант верный, порядок перемешивается);
     F — исправить ошибку (ввести верное предложение целиком); O — собрать предложение из слов; T — перевести на английский */
  const H = {
    G: (q, a, w) => ({ t: "gap", q, a, w }),
    P: (q, o, w) => ({ t: "pick", q, o, w }),
    F: (q, a, w) => ({ t: "fix", q, a, w }),
    O: (ru, a, alt) => ({ t: "order", ru, a, alt: alt || [] }),
    T: (ru, a) => ({ t: "tr", ru, a })
  };
  const ls = build(H); if (book) ls.forEach(l => { l.b = book; });
  window.COURSE.push(...ls);
};
