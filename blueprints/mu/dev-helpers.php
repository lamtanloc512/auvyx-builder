<?php
/**
 * DEV ONLY — mounted by tools/dev.ts, never shipped in a zip.
 *
 * Deep links for reviewing editor states without clicking:
 *   /wp-admin/post.php?post=4&action=edit&auvyx_select=0.3.1&auvyx_device=Mobile&auvyx_tab=styles
 * auvyx_select is a block path (indexes), like @auvyx/block-ops paths.
 *
 * @package Auvyx\Builder
 */

add_action(
	'enqueue_block_editor_assets',
	static function () {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- read-only dev helper.
		if ( ! isset( $_GET['auvyx_select'] ) || '' === $_GET['auvyx_select'] ) {
			return;
		}
		$path   = array_map( 'intval', explode( '.', sanitize_text_field( wp_unslash( $_GET['auvyx_select'] ) ) ) );
		$device = sanitize_text_field( wp_unslash( $_GET['auvyx_device'] ?? '' ) );
		$tab    = sanitize_key( wp_unslash( $_GET['auvyx_tab'] ?? 'styles' ) );
		// auvyx_drag=pt,0,40 → press handle "pt" and move by (0, 40) without releasing.
		$drag   = sanitize_text_field( wp_unslash( $_GET['auvyx_drag'] ?? '' ) );
		// phpcs:enable

		$script = <<<'JS'
( function ( path, device, tab, drag ) {
	// Surface JS errors on screen so screenshots show them.
	const panel = document.createElement( 'pre' );
	panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:40vh;overflow:auto;margin:0;padding:8px;background:#7f1d1d;color:#fff;font:11px/1.4 monospace;z-index:1000000;white-space:pre-wrap;display:none';
	const report = ( text ) => { panel.style.display = 'block'; panel.textContent += text + '\n'; if ( ! panel.isConnected ) document.body.appendChild( panel ); };
	window.addEventListener( 'error', ( e ) => report( 'error: ' + e.message + ' @ ' + e.filename + ':' + e.lineno ) );
	window.addEventListener( 'unhandledrejection', ( e ) => report( 'rejection: ' + ( e.reason && e.reason.stack || e.reason ) ) );
	const originalError = console.error;
	console.error = ( ...args ) => { report( 'console.error: ' + args.map( ( a ) => a && a.stack ? a.stack : String( a ) ).join( ' ' ).slice( 0, 800 ) ); originalError( ...args ); };
	const { select, dispatch, subscribe } = wp.data;
	const unsubscribe = subscribe( () => {
		let blocks = select( 'core/block-editor' ).getBlocks();
		if ( ! blocks.length ) return;
		unsubscribe();
		let block;
		for ( const index of path ) { block = blocks[ index ]; if ( ! block ) return; blocks = block.innerBlocks; }
		setTimeout( () => {
			report( 'auvyx-dev: selecting ' + block.name + ' ' + block.clientId );
			dispatch( 'core/block-editor' ).selectBlock( block.clientId );
			dispatch( 'core/edit-post' ).openGeneralSidebar( 'edit-post/block' );
			if ( device ) dispatch( 'core/editor' ).setDeviceType( device );
			setTimeout( () => document.querySelector( `[role="tab"][id$="-${ tab }"]` )?.click(), 400 );
			if ( drag ) setTimeout( () => {
				const [ key, dx, dy ] = drag.split( ',' );
				const canvas = document.querySelector( 'iframe[name="editor-canvas"]' )?.contentDocument ?? document;
				const handle = canvas.querySelector( `[data-handle="${ key }"]` );
				if ( ! handle ) return report( 'auvyx-dev: no handle ' + key );
				const r = handle.getBoundingClientRect();
				const at = ( x, y ) => ( { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true } );
				const View = canvas.defaultView;
				handle.dispatchEvent( new View.PointerEvent( 'pointerdown', at( r.x + 2, r.y + 2 ) ) );
				[ 0.25, 0.5, 0.75, 1 ].forEach( ( t, i ) => setTimeout( () =>
					handle.dispatchEvent( new View.PointerEvent( 'pointermove', at( r.x + 2 + dx * t, r.y + 2 + dy * t ) ) ), 120 * ( i + 1 ) ) );
				report( 'auvyx-dev: dragged ' + key + ' by ' + dx + ',' + dy );
			}, 1500 );
		}, 800 );
	} );
} )
JS;
		wp_add_inline_script( 'wp-edit-post', $script . '(' . wp_json_encode( $path ) . ',' . wp_json_encode( $device ) . ',' . wp_json_encode( $tab ) . ',' . wp_json_encode( $drag ) . ');' );
	}
);

/*
 * Visual builder page: on-screen JS errors + optional simulated drag.
 *   /wp-admin/post.php?post=4&action=auvyx-builder&select=0&auvyx_drag=pt,0,60
 */
add_action(
	'auvyx_builder_visual_builder_footer',
	static function () {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only dev helper.
		$drag = sanitize_text_field( wp_unslash( $_GET['auvyx_drag'] ?? '' ) );
		?>
<script>
( function ( drag ) {
	const panel = document.createElement( 'pre' );
	panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:30vh;overflow:auto;margin:0;padding:6px 8px;background:#7f1d1d;color:#fff;font:11px/1.4 monospace;z-index:1000000;white-space:pre-wrap;display:none';
	const report = ( text ) => { panel.style.display = 'block'; panel.textContent += text + '\n'; if ( ! panel.isConnected ) document.body.appendChild( panel ); };
	window.addEventListener( 'error', ( e ) => report( 'error: ' + e.message + ' @ ' + e.filename + ':' + e.lineno ) );
	window.addEventListener( 'unhandledrejection', ( e ) => report( 'rejection: ' + ( e.reason && e.reason.stack || e.reason ) ) );
	const originalError = console.error;
	console.error = ( ...args ) => { report( 'console.error: ' + args.map( ( a ) => a && a.stack ? a.stack : String( a ) ).join( ' ' ).slice( 0, 600 ) ); originalError( ...args ); };
	if ( ! drag ) return;
	const [ key, dx, dy ] = drag.split( ',' ).map( ( v, i ) => i ? Number( v ) : v );
	const started = Date.now();
	const timer = setInterval( () => {
		const doc = document.querySelector( '.auvyx-vb-canvas iframe' )?.contentDocument;
		const handle = doc?.querySelector( `[data-handle="${ key }"]` );
		if ( ! handle ) { if ( Date.now() - started > 20000 ) { clearInterval( timer ); report( 'auvyx-dev: no handle ' + key ); } return; }
		clearInterval( timer );
		const r = handle.getBoundingClientRect();
		const View = doc.defaultView;
		const at = ( x, y ) => ( { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true } );
		handle.dispatchEvent( new View.PointerEvent( 'pointerdown', at( r.x + 2, r.y + 2 ) ) );
		[ 0.25, 0.5, 0.75, 1 ].forEach( ( t, i ) => setTimeout( () => handle.dispatchEvent( new View.PointerEvent( 'pointermove', at( r.x + 2 + dx * t, r.y + 2 + dy * t ) ) ), 150 * ( i + 1 ) ) );
	}, 300 );
} )( <?php echo wp_json_encode( $drag ); ?> );
</script>
		<?php
	}
);

// The dev site links the plugin/theme folders to the repo: installing a zip here would
// delete source files. File mods are disabled in blueprints/dev.json; explain why.
add_action(
	'admin_notices',
	static function () {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || ! in_array( $screen->id, array( 'plugins', 'themes', 'plugin-install', 'theme-install' ), true ) ) {
			return;
		}
		echo '<div class="notice notice-warning"><p><strong>Dev site:</strong> Auvyx Builder and Auvyx Theme are linked to the source code, so installing or deleting plugins/themes is disabled here. To test the release zips like a customer, run <code>bun run try</code> (http://127.0.0.1:9500).</p></div>';
	}
);

// Auvyx Editor: the address may click, drag and save on the dev site (lib/deepLink.ts ?click, ?dnd, ?saveAfter…).
add_filter( 'auvyx_editor_deep_link_actions', '__return_true' );
