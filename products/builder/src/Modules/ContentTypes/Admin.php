<?php
/**
 * wp-admin for content types: the fields box on an entry's edit screen (block and classic editor) and the
 * Auvyx Builder → Content types page (the definition as JSON, validate, save, import, export).
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\ContentTypes;

defined( 'ABSPATH' ) || exit;

final class Admin {

	const NONCE      = 'auvyx_content_fields_nonce';
	const NONCE_SAVE = 'auvyx_content_fields_save';
	const PAGE       = 'auvyx-builder-content-types';
	const DEF_NONCE  = 'auvyx_content_types_definition';
	const MAX_CHOICE = 300;

	public function register(): void {
		add_action( 'add_meta_boxes', array( $this, 'meta_boxes' ) );
		add_action( 'save_post', array( $this, 'save_post' ), 10, 2 );
		add_action( 'admin_notices', array( $this, 'notices' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		add_filter( 'auvyx_builder_admin_tabs', array( $this, 'tab' ) );
		add_action( 'admin_post_auvyx_content_types_save', array( $this, 'handle_save' ) );
		add_action( 'admin_post_auvyx_content_types_import', array( $this, 'handle_import' ) );
		add_action( 'admin_post_auvyx_content_types_export', array( $this, 'handle_export' ) );
	}

	// ---- the fields box ------------------------------------------------------------------------------

	/**
	 * @param string $post_type Post type.
	 */
	public function meta_boxes( $post_type ): void {
		$type = ContentTypes::type( (string) $post_type );
		if ( null === $type || array() === $type['fields'] ) {
			return;
		}
		add_meta_box(
			'auvyx-content-fields',
			/* translators: %s: content type name (singular) */
			sprintf( __( '%s details', 'auvyx-builder' ), $type['singular'] ),
			array( $this, 'render_box' ),
			$type['key'],
			'normal',
			'high',
			array( '__back_compat_meta_box' => false )
		);
	}

	private static function errors_key( int $post_id ): string {
		return 'auvyx_ct_errors_' . get_current_user_id() . '_' . $post_id;
	}

	/**
	 * @param \WP_Post $post Post.
	 */
	public function render_box( $post ): void {
		$type = ContentTypes::type( $post->post_type );
		if ( null === $type ) {
			return;
		}
		wp_nonce_field( self::NONCE_SAVE, self::NONCE );
		$kept   = get_transient( self::errors_key( $post->ID ) );
		$errors = is_array( $kept ) ? (array) ( $kept['errors'] ?? array() ) : array();
		$typed  = is_array( $kept ) ? (array) ( $kept['typed'] ?? array() ) : array();
		if ( $errors ) {
			echo '<div class="notice notice-error inline auvyx-ct-errors" role="alert"><p>' . esc_html__( 'These fields were not saved:', 'auvyx-builder' ) . '</p><ul>';
			foreach ( $errors as $error ) {
				echo '<li>' . esc_html( (string) $error ) . '</li>';
			}
			echo '</ul></div>';
		}
		echo '<div class="auvyx-ct-fields">';
		foreach ( $type['fields'] as $field ) {
			$value = array_key_exists( $field['key'], $typed ) ? $typed[ $field['key'] ] : ContentTypes::value( $post->ID, $field );
			self::render_field( $field, $value, 'auvyx_fields[' . $field['key'] . ']', 'auvyx-field-' . $field['key'] );
		}
		echo '</div>';
	}

	/**
	 * One field's input with its label and help.
	 *
	 * @param array<string, mixed> $field Field.
	 * @param mixed                $value Value (as kept, or as typed when it was refused).
	 * @param string               $name  Input name.
	 * @param string               $id    Input id.
	 */
	private static function render_field( array $field, $value, string $name, string $id ): void {
		$kind     = (string) $field['kind'];
		$required = $field['required'] ? ' <span class="auvyx-ct-required" aria-hidden="true">*</span><span class="screen-reader-text">' . esc_html__( '(required)', 'auvyx-builder' ) . '</span>' : '';
		$help_id  = $id . '-help';
		$describe = '' !== $field['help'] ? ' aria-describedby="' . esc_attr( $help_id ) . '"' : '';
		$req_attr = $field['required'] && ! in_array( $kind, array( 'checkbox', 'image', 'file', 'gallery', 'repeater', 'select', 'relation' ), true ) ? ' required' : '';
		$group    = in_array( $kind, array( 'repeater', 'gallery' ), true ) || ( 'select' === $kind && $field['multiple'] );
		echo '<div class="auvyx-ct-field auvyx-ct-field--' . esc_attr( $kind ) . '">';
		if ( $group ) {
			echo '<fieldset' . $describe . '><legend class="auvyx-ct-label">' . esc_html( $field['label'] ) . $required . '</legend>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built from escaped parts.
		} elseif ( 'checkbox' !== $kind ) {
			echo '<label class="auvyx-ct-label" for="' . esc_attr( $id ) . '">' . esc_html( $field['label'] ) . $required . '</label>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built from escaped parts.
		}
		$scalar = is_scalar( $value ) ? (string) $value : '';
		$attrs  = 'id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '"' . $describe . $req_attr;
		switch ( $kind ) {
			case 'textarea':
				echo '<textarea ' . $attrs . ' rows="5" class="large-text">' . esc_textarea( $scalar ) . '</textarea>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $attrs is escaped.
				break;
			case 'number':
			case 'money':
				$step  = 'money' === $kind ? '0.01' : 'any';
				$min   = null !== $field['min'] ? ' min="' . esc_attr( Model::show( (float) $field['min'] ) ) . '"' : '';
				$max   = null !== $field['max'] ? ' max="' . esc_attr( Model::show( (float) $field['max'] ) ) . '"' : '';
				$shown = is_float( $value ) || is_int( $value ) ? ( 'money' === $kind ? number_format( (float) $value, 2, '.', '' ) : Model::show( (float) $value ) ) : $scalar;
				echo '<input type="number" ' . $attrs . ' step="' . esc_attr( $step ) . '"' . $min . $max . ' value="' . esc_attr( $shown ) . '" class="regular-text">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped parts.
				break;
			case 'date':
			case 'time':
			case 'email':
				echo '<input type="' . esc_attr( $kind ) . '" ' . $attrs . ' value="' . esc_attr( $scalar ) . '" class="regular-text">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $attrs is escaped.
				break;
			case 'datetime':
				echo '<input type="datetime-local" ' . $attrs . ' value="' . esc_attr( $scalar ) . '" class="regular-text">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $attrs is escaped.
				break;
			case 'phone':
				echo '<input type="tel" ' . $attrs . ' value="' . esc_attr( $scalar ) . '" class="regular-text" autocomplete="off">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $attrs is escaped.
				break;
			case 'url':
				// Text, not type=url: a site path (/contact) is a link too.
				echo '<input type="text" inputmode="url" ' . $attrs . ' value="' . esc_attr( $scalar ) . '" class="large-text" placeholder="https://">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $attrs is escaped.
				break;
			case 'color':
				echo '<span class="auvyx-ct-color" data-auvyx-color><input type="text" ' . $attrs . ' value="' . esc_attr( $scalar ) . '" class="small-text" placeholder="#rrggbb" pattern="#[0-9a-fA-F]{6}"> <input type="color" value="' . esc_attr( '' !== $scalar ? $scalar : '#000000' ) . '" aria-label="' . esc_attr( $field['label'] ) . '" tabindex="-1"></span>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $attrs is escaped.
				break;
			case 'checkbox':
				echo '<input type="hidden" name="' . esc_attr( $name ) . '" value="0"><label class="auvyx-ct-check" for="' . esc_attr( $id ) . '"><input type="checkbox" ' . $attrs . ' value="1"' . checked( true === $value || '1' === $value, true, false ) . '> ' . esc_html( $field['label'] ) . $required . '</label>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped parts.
				break;
			case 'select':
				self::render_choice( $field, $value, $name, $id, $describe );
				break;
			case 'relation':
				self::render_relation( $field, $value, $name, $id, $describe );
				break;
			case 'image':
			case 'file':
			case 'gallery':
				self::render_media( $field, $value, $name, $id );
				break;
			case 'repeater':
				self::render_rows( $field, $value, $name, $id );
				break;
			default:
				echo '<input type="text" ' . $attrs . ' value="' . esc_attr( $scalar ) . '" class="large-text" maxlength="' . esc_attr( (string) Model::MAX_TEXT ) . '">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $attrs is escaped.
		}
		if ( '' !== $field['help'] ) {
			echo '<p class="description" id="' . esc_attr( $help_id ) . '">' . esc_html( $field['help'] ) . '</p>';
		}
		if ( $group ) {
			echo '</fieldset>';
		}
		echo '</div>';
	}

	/**
	 * @param array<string, mixed> $field    Field.
	 * @param mixed                $value    Value.
	 * @param string               $describe aria-describedby (escaped).
	 */
	private static function render_choice( array $field, $value, string $name, string $id, string $describe ): void {
		$picked = array_map( 'strval', is_array( $value ) ? $value : ( null === $value ? array() : array( $value ) ) );
		if ( $field['multiple'] ) {
			foreach ( $field['options'] as $i => $option ) {
				$oid = $id . '-' . $i;
				echo '<label class="auvyx-ct-check" for="' . esc_attr( $oid ) . '"><input type="checkbox" id="' . esc_attr( $oid ) . '" name="' . esc_attr( $name ) . '[]" value="' . esc_attr( $option ) . '"' . checked( in_array( $option, $picked, true ), true, false ) . '> ' . esc_html( $option ) . '</label>';
			}
			echo '<input type="hidden" name="' . esc_attr( $name ) . '[]" value="">';
			return;
		}
		echo '<select id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '"' . $describe . '><option value="">' . esc_html__( '— Choose —', 'auvyx-builder' ) . '</option>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $describe is escaped.
		foreach ( $field['options'] as $option ) {
			echo '<option value="' . esc_attr( $option ) . '"' . selected( in_array( $option, $picked, true ), true, false ) . '>' . esc_html( $option ) . '</option>';
		}
		echo '</select>';
	}

	/**
	 * Entries of the linked type to pick from.
	 *
	 * @param array<string, mixed> $field    Field.
	 * @param mixed                $value    Value.
	 * @param string               $describe aria-describedby (escaped).
	 */
	private static function render_relation( array $field, $value, string $name, string $id, string $describe ): void {
		$picked  = array_map( 'intval', is_array( $value ) ? $value : ( null === $value || '' === $value ? array() : array( $value ) ) );
		$entries = post_type_exists( $field['to'] ) ? get_posts(
			array(
				'post_type'      => $field['to'],
				'post_status'    => array( 'publish', 'draft', 'pending', 'future', 'private' ),
				'posts_per_page' => self::MAX_CHOICE,
				'orderby'        => 'title',
				'order'          => 'ASC',
				'no_found_rows'  => true,
			)
		) : array();
		// Linked entries outside the first page stay selectable.
		$listed = wp_list_pluck( $entries, 'ID' );
		foreach ( $picked as $pid ) {
			if ( ! in_array( $pid, $listed, true ) && get_post( $pid ) ) {
				$entries[] = get_post( $pid );
			}
		}
		$multiple = $field['multiple'];
		echo '<select id="' . esc_attr( $id ) . '" name="' . esc_attr( $name . ( $multiple ? '[]' : '' ) ) . '"' . ( $multiple ? ' multiple size="6"' : '' ) . $describe . ' class="auvyx-ct-relation">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $describe is escaped.
		if ( ! $multiple ) {
			echo '<option value="">' . esc_html__( '— None —', 'auvyx-builder' ) . '</option>';
		}
		foreach ( $entries as $entry ) {
			$title = '' !== $entry->post_title ? $entry->post_title : __( '(no title)', 'auvyx-builder' );
			echo '<option value="' . esc_attr( (string) $entry->ID ) . '"' . selected( in_array( (int) $entry->ID, $picked, true ), true, false ) . '>' . esc_html( $title . ( 'publish' === $entry->post_status ? '' : ' (' . $entry->post_status . ')' ) ) . '</option>';
		}
		echo '</select>';
		if ( $multiple ) {
			echo '<input type="hidden" name="' . esc_attr( $name ) . '[]" value="">';
		}
	}

	/**
	 * A picture, a file or a gallery: ids in a hidden input, chosen with the media library.
	 *
	 * @param array<string, mixed> $field Field.
	 * @param mixed                $value Value.
	 */
	private static function render_media( array $field, $value, string $name, string $id ): void {
		$kind = (string) $field['kind'];
		$ids  = array_values( array_filter( array_map( 'intval', is_array( $value ) ? $value : ( is_scalar( $value ) ? explode( ',', (string) $value ) : array() ) ) ) );
		echo '<div class="auvyx-ct-media" data-auvyx-media="' . esc_attr( $kind ) . '" data-title="' . esc_attr( $field['label'] ) . '">';
		echo '<input type="hidden" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( implode( ',', $ids ) ) . '">';
		echo '<ul class="auvyx-ct-media__preview">';
		foreach ( $ids as $aid ) {
			echo '<li data-id="' . esc_attr( (string) $aid ) . '">' . self::attachment_preview( $aid, $kind ) . '</li>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in attachment_preview.
		}
		echo '</ul>';
		$choose = 'gallery' === $kind ? __( 'Add pictures', 'auvyx-builder' ) : ( 'file' === $kind ? __( 'Choose a file', 'auvyx-builder' ) : __( 'Choose a picture', 'auvyx-builder' ) );
		echo '<button type="button" class="button auvyx-ct-media__choose" aria-controls="' . esc_attr( $id ) . '">' . esc_html( $choose ) . '</button> ';
		echo '<button type="button" class="button-link auvyx-ct-media__clear"' . ( $ids ? '' : ' hidden' ) . '>' . esc_html__( 'Remove', 'auvyx-builder' ) . '</button>';
		echo '</div>';
	}

	private static function attachment_preview( int $id, string $kind ): string {
		if ( 'file' !== $kind && wp_attachment_is_image( $id ) ) {
			return (string) wp_get_attachment_image( $id, 'thumbnail', false, array( 'alt' => '' ) );
		}
		$file = get_attached_file( $id );
		return '<span class="auvyx-ct-media__file">' . esc_html( $file ? wp_basename( $file ) : '#' . $id ) . '</span>';
	}

	/**
	 * Rows: one block of inputs per row, a template for new rows (vanilla JS adds, removes and moves them).
	 *
	 * @param array<string, mixed> $field Field.
	 * @param mixed                $value Value.
	 */
	private static function render_rows( array $field, $value, string $name, string $id ): void {
		$rows = is_array( $value ) && Model::is_list( $value ) ? $value : array();
		echo '<div class="auvyx-ct-rows" data-auvyx-repeater data-max="' . esc_attr( (string) Model::MAX_ROWS ) . '"><ol class="auvyx-ct-rows__list">';
		foreach ( $rows as $i => $row ) {
			self::render_row( $field, is_array( $row ) ? $row : array(), $name, $id, (string) $i );
		}
		echo '</ol><template>';
		self::render_row( $field, array(), $name, $id, '__i__' );
		echo '</template><button type="button" class="button auvyx-ct-rows__add">' . esc_html__( 'Add a row', 'auvyx-builder' ) . '</button></div>';
	}

	/**
	 * @param array<string, mixed> $field Repeater.
	 * @param array<string, mixed> $row   Row values.
	 */
	private static function render_row( array $field, array $row, string $name, string $id, string $index ): void {
		echo '<li class="auvyx-ct-row"><div class="auvyx-ct-row__fields">';
		foreach ( $field['fields'] as $sub ) {
			$value = $row[ $sub['key'] ] ?? null;
			if ( 'checkbox' === $sub['kind'] && is_string( $value ) ) {
				$value = '1' === $value;
			}
			self::render_field( $sub, $value, $name . '[' . $index . '][' . $sub['key'] . ']', $id . '-' . $index . '-' . $sub['key'] );
		}
		echo '</div><div class="auvyx-ct-row__tools">';
		echo '<button type="button" class="button-link auvyx-ct-row__up">' . esc_html__( 'Move up', 'auvyx-builder' ) . '</button> ';
		echo '<button type="button" class="button-link auvyx-ct-row__down">' . esc_html__( 'Move down', 'auvyx-builder' ) . '</button> ';
		echo '<button type="button" class="button-link button-link-delete auvyx-ct-row__remove">' . esc_html__( 'Remove row', 'auvyx-builder' ) . '</button>';
		echo '</div></li>';
	}

	/**
	 * The box's form values as Model expects them: lists without the empty marker, media ids from "1,2,3".
	 *
	 * @param array<string, mixed> $field Field.
	 * @param mixed                $raw   Posted value (unslashed).
	 * @return mixed
	 */
	public static function from_form( array $field, $raw ) {
		$kind = (string) $field['kind'];
		if ( 'gallery' === $kind ) {
			$raw = is_string( $raw ) ? explode( ',', $raw ) : $raw;
		}
		if ( 'gallery' === $kind || ( in_array( $kind, array( 'select', 'relation' ), true ) && $field['multiple'] ) ) {
			return is_array( $raw ) ? array_values( array_filter( $raw, static fn( $v ) => is_string( $v ) && '' !== trim( $v ) ) ) : $raw;
		}
		if ( 'repeater' === $kind ) {
			if ( ! is_array( $raw ) ) {
				return null;
			}
			$rows = array();
			foreach ( $raw as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$cells = array();
				foreach ( $field['fields'] as $sub ) {
					$cell = self::from_form( $sub, $row[ $sub['key'] ] ?? null );
					// An unticked box alone does not make a row.
					if ( null !== $cell && '' !== $cell && array() !== $cell && ! ( 'checkbox' === $sub['kind'] && '0' === $cell ) ) {
						$cells[ $sub['key'] ] = $cell;
					}
				}
				$rows[] = $cells;
			}
			return array_values( array_filter( $rows ) );
		}
		return $raw;
	}

	/**
	 * Saves the box: every valid field is kept, a refused one keeps its previous value and its error is shown.
	 *
	 * @param int      $post_id Post.
	 * @param \WP_Post $post    Post.
	 */
	public function save_post( $post_id, $post = null ): void {
		$post_id = (int) $post_id;
		if ( ! isset( $_POST[ self::NONCE ] ) || ! wp_verify_nonce( sanitize_key( wp_unslash( $_POST[ self::NONCE ] ) ), self::NONCE_SAVE ) ) {
			return;
		}
		if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || wp_is_post_autosave( $post_id ) || wp_is_post_revision( $post_id ) ) {
			return;
		}
		$post = $post instanceof \WP_Post ? $post : get_post( $post_id );
		$type = $post ? ContentTypes::type( $post->post_type ) : null;
		if ( null === $type || ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}
		// Each value is checked by Model::sanitize below; unslashed here, never used raw.
		$posted = isset( $_POST['auvyx_fields'] ) && is_array( $_POST['auvyx_fields'] ) ? wp_unslash( $_POST['auvyx_fields'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$errors = array();
		$typed  = array();
		$values = array();
		foreach ( $type['fields'] as $field ) {
			$raw    = self::from_form( $field, $posted[ $field['key'] ] ?? null );
			$result = Model::sanitize( $field, $raw );
			if ( $result['ok'] ) {
				$values[ $field['key'] ] = $result['value'];
			} else {
				$errors[] = $result['error'];
				if ( is_scalar( $raw ) ) {
					$typed[ $field['key'] ] = (string) $raw;
				}
			}
		}
		ContentTypes::store( $post_id, $type, $values );
		if ( $errors ) {
			set_transient(
				self::errors_key( $post_id ),
				array(
					'errors' => $errors,
					'typed'  => $typed,
				),
				5 * MINUTE_IN_SECONDS
			);
		} else {
			delete_transient( self::errors_key( $post_id ) );
		}
	}

	/** The fields that were not saved, on the entry's edit screen (shown once). */
	public function notices(): void {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || 'post' !== $screen->base || null === ContentTypes::type( (string) $screen->post_type ) ) {
			return;
		}
		$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
		$kept    = $post_id ? get_transient( self::errors_key( $post_id ) ) : false;
		if ( ! is_array( $kept ) || empty( $kept['errors'] ) ) {
			return;
		}
		echo '<div class="notice notice-error is-dismissible"><p>' . esc_html__( 'Some fields were not saved (they keep their previous value):', 'auvyx-builder' ) . '</p><ul>';
		foreach ( (array) $kept['errors'] as $error ) {
			echo '<li>' . esc_html( (string) $error ) . '</li>';
		}
		echo '</ul></div>';
	}

	/**
	 * @param string $hook Admin page.
	 */
	public function enqueue( $hook ): void {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ( 'post.php' !== $hook && 'post-new.php' !== $hook ) || ! $screen || null === ContentTypes::type( (string) $screen->post_type ) ) {
			return;
		}
		wp_enqueue_media();
		wp_enqueue_script( 'auvyx-content-fields', AUVYX_BUILDER_URL . 'assets/content-fields.js', array(), AUVYX_BUILDER_VERSION, true );
		wp_localize_script(
			'auvyx-content-fields',
			'auvyxContentFields',
			array(
				'choose' => __( 'Use', 'auvyx-builder' ),
				'remove' => __( 'Remove', 'auvyx-builder' ),
			)
		);
		wp_register_style( 'auvyx-content-fields-admin', false, array(), AUVYX_BUILDER_VERSION );
		wp_enqueue_style( 'auvyx-content-fields-admin' );
		wp_add_inline_style(
			'auvyx-content-fields-admin',
			'.auvyx-ct-field{margin:0 0 16px}.auvyx-ct-field fieldset{border:0;margin:0;padding:0}.auvyx-ct-label{display:block;font-weight:600;margin:0 0 4px}.auvyx-ct-required{color:#d63638}'
			. '.auvyx-ct-check{display:inline-block;margin:2px 12px 2px 0}.auvyx-ct-relation{min-width:16em;max-width:100%}'
			. '.auvyx-ct-media__preview{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px;padding:0;list-style:none}.auvyx-ct-media__preview:empty{display:none}.auvyx-ct-media__preview img{display:block;width:72px;height:72px;object-fit:cover;border-radius:3px}.auvyx-ct-media__file{display:inline-block;padding:4px 8px;background:#f0f0f1;border-radius:3px}'
			. '.auvyx-ct-rows__list{margin:0 0 8px;padding:0;list-style:none;counter-reset:row}.auvyx-ct-row{border:1px solid #dcdcde;border-radius:4px;padding:12px;margin:0 0 8px;background:#fff}.auvyx-ct-row__fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 16px}.auvyx-ct-row__tools{display:flex;gap:12px;justify-content:flex-end}'
			. '.auvyx-ct-errors ul{list-style:disc;margin-left:20px}'
		);
	}

	// ---- Auvyx Builder → Content types ----------------------------------------------------------------

	/**
	 * @param array<string, mixed> $tabs Tabs so far.
	 * @return array<string, mixed>
	 */
	public function tab( $tabs ): array {
		$tabs                   = (array) $tabs;
		$tabs['-content-types'] = array(
			__( 'Content types', 'auvyx-builder' ),
			'manage_options',
			array( $this, 'render_page' ),
			__( 'Your own kinds of content (Properties, Courses, Rooms…) with their fields and taxonomies.', 'auvyx-builder' ),
		);
		return $tabs;
	}

	private static function result_key(): string {
		return 'auvyx_ct_result_' . get_current_user_id();
	}

	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$definition = ContentTypes::definition();
		$result     = get_transient( self::result_key() );
		delete_transient( self::result_key() );
		$result = is_array( $result ) ? $result : array();
		$text   = isset( $result['text'] ) ? (string) $result['text'] : (string) wp_json_encode( Model::to_json( $definition ), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );

		if ( ! empty( $result['errors'] ) ) {
			echo '<div class="notice notice-error" role="alert"><p>' . esc_html( (string) ( $result['message'] ?? __( 'The definition was not saved:', 'auvyx-builder' ) ) ) . '</p><ul style="list-style:disc;margin-left:20px">';
			foreach ( (array) $result['errors'] as $error ) {
				echo '<li><code>' . esc_html( (string) $error ) . '</code></li>';
			}
			echo '</ul></div>';
		} elseif ( ! empty( $result['message'] ) ) {
			echo '<div class="notice notice-success" role="status"><p>' . esc_html( (string) $result['message'] ) . '</p></div>';
		}

		echo '<h2>' . esc_html__( 'Types', 'auvyx-builder' ) . '</h2>';
		if ( array() === $definition['types'] ) {
			echo '<p>' . esc_html__( 'No content types yet. Describe one below (or ask the AI in the Auvyx editor).', 'auvyx-builder' ) . '</p>';
		} else {
			echo '<table class="widefat striped"><thead><tr><th scope="col">' . esc_html__( 'Type', 'auvyx-builder' ) . '</th><th scope="col">' . esc_html__( 'Address', 'auvyx-builder' ) . '</th><th scope="col">' . esc_html__( 'Fields', 'auvyx-builder' ) . '</th><th scope="col">' . esc_html__( 'Entries', 'auvyx-builder' ) . '</th></tr></thead><tbody>';
			foreach ( $definition['types'] as $type ) {
				$fields = array();
				foreach ( $type['fields'] as $field ) {
					$fields[] = '<code>' . esc_html( $field['key'] ) . '</code> ' . esc_html( Model::KINDS[ $field['kind'] ] ?? $field['kind'] ) . ( $field['required'] ? '*' : '' ) . ( 'relation' === $field['kind'] ? ' → ' . esc_html( $field['to'] ) : '' );
				}
				$count = post_type_exists( $type['key'] ) ? (int) array_sum( (array) wp_count_posts( $type['key'] ) ) : 0;
				$list  = admin_url( 'edit.php?post_type=' . rawurlencode( $type['key'] ) );
				echo '<tr><td><strong>' . esc_html( $type['label'] ) . '</strong><br><code>' . esc_html( $type['key'] ) . '</code>' . ( $type['public'] ? '' : ' ' . esc_html__( '(private)', 'auvyx-builder' ) ) . '</td>';
				echo '<td>/' . esc_html( $type['slug'] ) . '/</td>';
				echo '<td>' . ( $fields ? implode( ', ', $fields ) : '—' ) . '</td>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped parts.
				echo '<td><a href="' . esc_url( $list ) . '">' . esc_html( number_format_i18n( $count ) ) . '</a></td></tr>';
			}
			echo '</tbody></table>';
		}
		if ( array() !== $definition['taxonomies'] ) {
			echo '<h2>' . esc_html__( 'Taxonomies', 'auvyx-builder' ) . '</h2><ul>';
			foreach ( $definition['taxonomies'] as $taxonomy ) {
				echo '<li><strong>' . esc_html( $taxonomy['label'] ) . '</strong> <code>' . esc_html( $taxonomy['key'] ) . '</code> — ' . esc_html( implode( ', ', $taxonomy['types'] ) ) . '</li>';
			}
			echo '</ul>';
		}

		$action = admin_url( 'admin-post.php' );
		echo '<h2>' . esc_html__( 'Definition (JSON)', 'auvyx-builder' ) . '</h2>';
		echo '<p>' . esc_html__( 'The whole definition: saving replaces it. Removing a type keeps its entries; they come back with the type.', 'auvyx-builder' ) . '</p>';
		echo '<form method="post" action="' . esc_url( $action ) . '">';
		wp_nonce_field( self::DEF_NONCE );
		echo '<input type="hidden" name="action" value="auvyx_content_types_save">';
		echo '<label class="screen-reader-text" for="auvyx-ct-definition">' . esc_html__( 'Definition (JSON)', 'auvyx-builder' ) . '</label>';
		echo '<textarea id="auvyx-ct-definition" name="definition" rows="24" class="large-text code" spellcheck="false">' . esc_textarea( $text ) . '</textarea>';
		echo '<p><button type="submit" name="intent" value="validate" class="button">' . esc_html__( 'Validate', 'auvyx-builder' ) . '</button> ';
		echo '<button type="submit" name="intent" value="save" class="button button-primary">' . esc_html__( 'Validate & save', 'auvyx-builder' ) . '</button> ';
		echo '<a class="button" href="' . esc_url( wp_nonce_url( add_query_arg( 'action', 'auvyx_content_types_export', $action ), self::DEF_NONCE ) ) . '">' . esc_html__( 'Export', 'auvyx-builder' ) . '</a></p>';
		echo '</form>';

		echo '<h2>' . esc_html__( 'Import', 'auvyx-builder' ) . '</h2>';
		echo '<p>' . esc_html__( 'Paste a definition: its types and taxonomies are added, or replace the ones with the same key. The others stay.', 'auvyx-builder' ) . '</p>';
		echo '<form method="post" action="' . esc_url( $action ) . '">';
		wp_nonce_field( self::DEF_NONCE );
		echo '<input type="hidden" name="action" value="auvyx_content_types_import">';
		echo '<label class="screen-reader-text" for="auvyx-ct-import">' . esc_html__( 'Definition to import (JSON)', 'auvyx-builder' ) . '</label>';
		echo '<textarea id="auvyx-ct-import" name="import" rows="8" class="large-text code" spellcheck="false"></textarea>';
		echo '<p><button type="submit" class="button">' . esc_html__( 'Import', 'auvyx-builder' ) . '</button></p></form>';
	}

	/** Checks the admin request (capability + nonce) or stops. */
	private static function check(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to change content types.', 'auvyx-builder' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::DEF_NONCE );
	}

	/**
	 * @param array<string, mixed> $result What the page shows next.
	 */
	private static function back( array $result ): void {
		set_transient( self::result_key(), $result, 10 * MINUTE_IN_SECONDS );
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::PAGE ) );
		exit;
	}

	/**
	 * The posted JSON, decoded with objects kept apart from lists, or the errors.
	 *
	 * @return array{json: mixed, errors: array<int, string>}
	 */
	private static function decode( string $text ): array {
		$json = json_decode( $text, false );
		if ( null === $json && 'null' !== trim( $text ) ) {
			return array(
				'json'   => null,
				'errors' => array( 'definition: not JSON' ),
			);
		}
		return array(
			'json'   => $json instanceof \stdClass && property_exists( $json, 'definition' ) && ! property_exists( $json, 'types' ) ? $json->definition : $json,
			'errors' => array(),
		);
	}

	public function handle_save(): void {
		self::check();
		$text    = isset( $_POST['definition'] ) ? (string) wp_unslash( $_POST['definition'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized, WordPress.Security.NonceVerification.Missing -- nonce checked in check(); JSON, checked by Model::validate.
		$intent  = isset( $_POST['intent'] ) && 'validate' === $_POST['intent'] ? 'validate' : 'save'; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- nonce checked in check().
		$decoded = self::decode( $text );
		if ( $decoded['errors'] ) {
			self::back(
				array(
					'text'   => $text,
					'errors' => $decoded['errors'],
				)
			);
		}
		$result = 'save' === $intent ? ContentTypes::save( $decoded['json'] ) : Model::validate( $decoded['json'] );
		if ( null === $result['definition'] ) {
			self::back(
				array(
					'text'   => $text,
					'errors' => $result['errors'],
				)
			);
		}
		self::back(
			'save' === $intent ? array( 'message' => __( 'Content types saved.', 'auvyx-builder' ) ) : array(
				'text'    => $text,
				'message' => __( 'The definition is valid (not saved yet).', 'auvyx-builder' ),
			)
		);
	}

	public function handle_import(): void {
		self::check();
		$text    = isset( $_POST['import'] ) ? (string) wp_unslash( $_POST['import'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized, WordPress.Security.NonceVerification.Missing -- nonce checked in check(); JSON, checked by Model::validate.
		$decoded = self::decode( $text );
		$patch   = $decoded['errors'] ? array( 'errors' => $decoded['errors'], 'definition' => null ) : Model::validate( $decoded['json'] ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing.AssociativeArrayFound
		if ( null === $patch['definition'] ) {
			self::back(
				array(
					'errors'  => $patch['errors'],
					'message' => __( 'Nothing was imported:', 'auvyx-builder' ),
				)
			);
		}
		$merged = Model::merge( ContentTypes::definition(), $patch['definition'] );
		$result = ContentTypes::save( Model::to_json( $merged ) );
		if ( null === $result['definition'] ) {
			self::back(
				array(
					'errors'  => $result['errors'],
					'message' => __( 'Nothing was imported (the merged definition is refused):', 'auvyx-builder' ),
				)
			);
		}
		self::back( array( 'message' => __( 'Imported.', 'auvyx-builder' ) ) );
	}

	public function handle_export(): void {
		self::check();
		nocache_headers();
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="content-types.json"' );
		echo wp_json_encode( Model::to_json( ContentTypes::definition() ), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- a JSON download.
		exit;
	}
}
