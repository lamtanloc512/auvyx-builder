/**
 * Auvyx content types: the fields box on an entry's edit screen (Modules/ContentTypes/Admin.php). Pictures, files and
 * galleries are chosen with the WordPress media library; rows are added, removed and moved here. No dependencies
 * beyond wp.media (loaded by wp_enqueue_media). Event delegation: rows added later work the same.
 */
(function () {
	'use strict';

	var strings = window.auvyxContentFields || { choose: 'Use', remove: 'Remove' };
	var counter = 0;

	function closest(el, selector) {
		while (el && el.nodeType === 1) {
			if (el.matches(selector)) {
				return el;
			}
			el = el.parentElement;
		}
		return null;
	}

	// ---- media ----------------------------------------------------------------------------------

	function preview(item, kind) {
		var li = document.createElement('li');
		li.setAttribute('data-id', String(item.id));
		var sizes = item.sizes || {};
		var thumb = (sizes.thumbnail || sizes.medium || sizes.full || {}).url;
		if (kind !== 'file' && item.type === 'image' && thumb) {
			var img = document.createElement('img');
			img.src = thumb;
			img.alt = '';
			li.appendChild(img);
		} else {
			var span = document.createElement('span');
			span.className = 'auvyx-ct-media__file';
			span.textContent = item.filename || item.title || '#' + item.id;
			li.appendChild(span);
		}
		return li;
	}

	function setMedia(box, items) {
		var kind = box.getAttribute('data-auvyx-media');
		var input = box.querySelector('input[type="hidden"]');
		var list = box.querySelector('.auvyx-ct-media__preview');
		var ids = kind === 'gallery' && input.value ? input.value.split(',').filter(Boolean) : [];
		if (kind !== 'gallery') {
			list.textContent = '';
		}
		items.forEach(function (item) {
			if (ids.indexOf(String(item.id)) === -1) {
				ids.push(String(item.id));
				list.appendChild(preview(item, kind));
			}
		});
		input.value = ids.join(',');
		box.querySelector('.auvyx-ct-media__clear').hidden = ids.length === 0;
	}

	function chooseMedia(box) {
		if (!window.wp || !window.wp.media) {
			return;
		}
		var kind = box.getAttribute('data-auvyx-media');
		var frame = window.wp.media({
			title: box.getAttribute('data-title') || '',
			button: { text: strings.choose },
			multiple: kind === 'gallery' ? 'add' : false,
			library: kind === 'file' ? {} : { type: 'image' }
		});
		frame.on('select', function () {
			setMedia(box, frame.state().get('selection').toJSON());
		});
		frame.open();
	}

	function clearMedia(box) {
		box.querySelector('input[type="hidden"]').value = '';
		box.querySelector('.auvyx-ct-media__preview').textContent = '';
		box.querySelector('.auvyx-ct-media__clear').hidden = true;
	}

	// ---- rows -------------------------------------------------------------------------------------

	function addRow(repeater) {
		var list = repeater.querySelector('.auvyx-ct-rows__list');
		var max = parseInt(repeater.getAttribute('data-max'), 10) || 50;
		if (list.children.length >= max) {
			return;
		}
		var template = repeater.querySelector('template');
		var index = 'n' + Date.now().toString(36) + (counter++);
		var html = template.innerHTML.split('__i__').join(index);
		var holder = document.createElement('ol');
		holder.innerHTML = html;
		var row = holder.firstElementChild;
		list.appendChild(row);
		var first = row.querySelector('input:not([type="hidden"]), select, textarea');
		if (first) {
			first.focus();
		}
	}

	function moveRow(row, up) {
		var sibling = up ? row.previousElementSibling : row.nextElementSibling;
		if (!sibling) {
			return;
		}
		row.parentNode.insertBefore(up ? row : sibling, up ? sibling : row);
	}

	// ---- events -----------------------------------------------------------------------------------

	document.addEventListener('click', function (event) {
		var target = event.target;
		var button = closest(target, 'button');
		if (!button || !closest(button, '.auvyx-ct-fields')) {
			return;
		}
		var media = closest(button, '[data-auvyx-media]');
		var row = closest(button, '.auvyx-ct-row');
		if (button.classList.contains('auvyx-ct-media__choose') && media) {
			event.preventDefault();
			chooseMedia(media);
		} else if (button.classList.contains('auvyx-ct-media__clear') && media) {
			event.preventDefault();
			clearMedia(media);
		} else if (button.classList.contains('auvyx-ct-rows__add')) {
			event.preventDefault();
			addRow(closest(button, '[data-auvyx-repeater]'));
		} else if (row && button.classList.contains('auvyx-ct-row__remove')) {
			event.preventDefault();
			var next = row.nextElementSibling || row.previousElementSibling;
			var repeater = closest(row, '[data-auvyx-repeater]');
			row.parentNode.removeChild(row);
			var focus = next ? next.querySelector('button') : repeater && repeater.querySelector('.auvyx-ct-rows__add');
			if (focus) {
				focus.focus();
			}
		} else if (row && button.classList.contains('auvyx-ct-row__up')) {
			event.preventDefault();
			moveRow(row, true);
			button.focus();
		} else if (row && button.classList.contains('auvyx-ct-row__down')) {
			event.preventDefault();
			moveRow(row, false);
			button.focus();
		}
	});

	// A colour: the text input and the picker stay in step.
	document.addEventListener('input', function (event) {
		var box = closest(event.target, '[data-auvyx-color]');
		if (!box) {
			return;
		}
		var text = box.querySelector('input[type="text"]');
		var picker = box.querySelector('input[type="color"]');
		if (event.target === picker) {
			text.value = picker.value;
		} else if (/^#[0-9a-fA-F]{6}$/.test(text.value)) {
			picker.value = text.value.toLowerCase();
		}
	});
})();
